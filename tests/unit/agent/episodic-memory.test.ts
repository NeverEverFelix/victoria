import { describe, expect, it } from "vitest";
import { MockLlmAdapter, MockMemoryProvider, MockVictoriaTools, VictoriaAgent } from "../../../src/agent/index.js";
import { MemoryOrchestrator } from "../../../src/agent/memory/memory-orchestrator.js";
import { authoritativeEpisodeOutcome, EPISODIC_MEMORY_MAX_AGE_MS, isUsableEpisodicSummary, SEMANTIC_MEMORY_RECALL_MIN_SIMILARITY, suppressLifecycleConflictingEpisodes, validateEpisodicSummary } from "../../../src/agent/memory/episodic-summary.js";

describe("episodic memory summaries", () => {
  it("summarizes context before the short-term window rolls over and retrieves the episode later", async () => {
    const memory = new MockMemoryProvider();
    const llm = new MockLlmAdapter();
    llm.classifyMessage = async ({ userMessage }) => ({
      type: "general_finance", confidence: 0.9, summary: userMessage, needsClarification: false
    });
    const summarizedChunks: string[][] = [];
    let summarizedPairs: readonly { precedingAssistantMessage?: string; userMessage: string }[] = [];
    const agent = new VictoriaAgent({
      llm, memory, tools: new MockVictoriaTools(),
      episodicMemorySummarizer: {
        async summarize({ userMessages, turnPairs }) {
          summarizedChunks.push([...userMessages]);
          summarizedPairs = turnPairs ?? [];
          return {
            summary: "The user is exploring a steady weekend savings routine.",
            evidenceQuotes: [userMessages[0]!],
            confidence: 0.93,
            sensitivity: "ordinary"
          };
        }
      }
    });
    const userId = "user_episodic";
    const conversationId = "budgeting_chat";
    for (let turn = 1; turn <= 11; turn += 1) {
      await agent.respond({ userId, conversationId, message: `I want a steady weekend budgeting routine, detail ${turn}.` });
    }

    expect(summarizedChunks).toHaveLength(1);
    expect(summarizedChunks[0]).toHaveLength(8);
    expect(summarizedPairs.some((pair) => Boolean(pair.precedingAssistantMessage) &&
      pair.userMessage.includes("weekend budgeting routine"))).toBe(true);
    const saved = await memory.listConversationalMemories(userId);
    expect(saved).toMatchObject([{
      category: "other", key: expect.stringMatching(/^episode:/),
      value: "The user is exploring a steady weekend savings routine.",
      sourceType: "system_inference", sourceMetadata: { memoryKind: "episodic_summary", evidenceCount: 1 }
    }]);
    const recalled = await memory.searchConversationalMemories(userId, "weekend savings routine");
    expect(recalled).toMatchObject([{ key: saved[0]?.key }]);

    const laterReply = await agent.respond({
      userId,
      conversationId: "a-new-conversation",
      message: "I want a steady weekend savings routine."
    });
    expect(laterReply.decision.action).toBe("reflect");
    expect(laterReply.message).toContain("note from an earlier conversation");
    expect(laterReply.message).toContain("steady weekend savings routine");

    const unrelatedReply = await agent.respond({
      userId,
      conversationId: "unrelated-conversation",
      message: "I'm thinking about starting a new project at work."
    });
    expect(unrelatedReply.message).not.toContain("weekend savings routine");
  });

  it("rejects summaries that lack exact supporting quotes or are sensitive or low confidence", () => {
    const messages = ["I am trying to make weekends less expensive.", "I want a routine I can stick with."];
    const valid = {
      summary: "The user is working toward a repeatable lower-cost weekend routine.",
      evidenceQuotes: [messages[0]], confidence: 0.9, sensitivity: "ordinary"
    };
    expect(validateEpisodicSummary(valid, messages, [], [{ turnId: "turn-user-a-1" }])).toMatchObject({
      category: "other", sourceType: "system_inference",
      sourceMetadata: {
        memoryKind: "episodic_summary", sourceTurnReferences: [{ turnId: "turn-user-a-1" }],
        summaryCoverage: { coveredTurnIds: ["turn-user-a-1"], throughTurnId: "turn-user-a-1" }
      }
    });
    expect(validateEpisodicSummary({ ...valid, evidenceQuotes: ["I have a different job now."] }, messages)).toBeNull();
    const longMessage = "I prefer using a simple weekend savings routine. ".repeat(3).trim();
    expect(validateEpisodicSummary({ ...valid, evidenceQuotes: [longMessage, longMessage] }, [longMessage])).toBeNull();
    expect(validateEpisodicSummary({ ...valid, sensitivity: "sensitive" }, messages)).toBeNull();
    expect(validateEpisodicSummary({ ...valid, confidence: 0.6 }, messages)).toBeNull();
  });

  it("stores workflow outcomes separately and only from a completed mocked ledger entry", () => {
    const entry = {
      id: "entry_authoritative", userId: "episode_user", eventId: "event_1", proposalId: "proposal_1",
      approvalId: "approval_1", approvedActionId: "action_1", amountCents: 2_500, currency: "USD" as const,
      reason: "Skipped takeout", movementMode: "mock_ledger" as const, status: "completed" as const,
      createdAt: "2026-10-27T16:00:00.000Z"
    };
    const outcome = authoritativeEpisodeOutcome(entry);
    const userMessage = "I am trying to cook at home on weeknights.";
    const candidate = validateEpisodicSummary({
      summary: "The user is trying to cook at home on weeknights.",
      evidenceQuotes: [userMessage], confidence: 0.93, sensitivity: "ordinary",
      authoritativeWorkflowOutcomes: [{ kind: "forged_model_claim", amountCents: 99_999 }]
    }, [userMessage], outcome ? [outcome] : []);

    expect(outcome).toMatchObject({ kind: "mocked_ledger_entry_recorded", entryId: entry.id, amountCents: 2_500 });
    expect(candidate?.value).toBe("The user is trying to cook at home on weeknights.");
    expect(candidate?.sourceMetadata?.authoritativeWorkflowOutcomes).toEqual([outcome]);
    expect(authoritativeEpisodeOutcome({ ...entry, status: "pending" })).toBeNull();
    expect(authoritativeEpisodeOutcome({ ...entry, movementMode: "real_transfer" as never })).toBeNull();
  });

  it("suppresses an episode when a user fact inside it was corrected or forgotten", () => {
    const userMessage = "I love hiking on weekends.";
    const episodeCandidate = validateEpisodicSummary({
      summary: "The user enjoys hiking on weekends and wants more trail time.",
      evidenceQuotes: [userMessage], confidence: 0.93, sensitivity: "ordinary"
    }, [userMessage])!;
    const episode = { ...episodeCandidate, id: "episode-hiking", createdAt: new Date().toISOString() };
    const forgotten = {
      id: "forgot-hiking", category: "other" as const, key: "interest:hiking", value: "Forgotten",
      evidence: "Forget hiking", confidence: 1, createdAt: new Date().toISOString(), sourceType: "user_correction" as const,
      sourceMetadata: { memoryStatus: "forgotten" }
    };

    expect(suppressLifecycleConflictingEpisodes([episode], [forgotten])).toEqual([]);
    expect(suppressLifecycleConflictingEpisodes([episode], [{
      ...forgotten, id: "correct-hiking", value: "No longer enjoys hiking.", sourceMetadata: { interestStatus: "inactive" }
    }])).toEqual([]);
    expect(suppressLifecycleConflictingEpisodes([episode], [{ ...forgotten, key: "goal:emergency_fund" }])).toEqual([episode]);
  });

  it("uses exact turn provenance for corrected or forgotten episodes while preserving unrelated same-topic episodes", () => {
    const linked = validateEpisodicSummary({
      summary: "The user enjoys hiking and wants to spend more time outdoors on weekends.",
      evidenceQuotes: ["I love hiking."], confidence: 0.94, sensitivity: "ordinary"
    }, ["I love hiking."], [], [{ turnId: "turn-hiking-1" }]);
    const unrelated = validateEpisodicSummary({
      summary: "The user enjoys hiking and wants to spend more time outdoors on weekends.",
      evidenceQuotes: ["I love hiking."], confidence: 0.94, sensitivity: "ordinary"
    }, ["I love hiking."], [], [{ turnId: "turn-hiking-2" }]);
    const asMemory = (value: typeof linked, id: string) => ({
      ...value!, id, createdAt: new Date().toISOString()
    });
    const retired: import("../../../src/agent/memory/types.js").ConversationalMemory = {
      id: "forgotten-hiking", category: "other", key: "interest:hiking", value: "Forgot hiking",
      evidence: "Forget this", confidence: 1, createdAt: new Date().toISOString(), sourceType: "user_correction",
      sourceMetadata: { memoryStatus: "forgotten", sourceTurnReferences: [{ turnId: "turn-hiking-1" }] }
    };

    expect(suppressLifecycleConflictingEpisodes([asMemory(linked, "episode-linked"), asMemory(unrelated, "episode-unrelated")], [retired])
      .map((memory) => memory.id)).toEqual(["episode-unrelated"]);
  });

  it("links a durable-turn episode to its source and suppresses it after that fact is corrected", async () => {
    const storage = new MockMemoryProvider();
    const memory = new MemoryOrchestrator(storage);
    const fact = await memory.rememberConversationalMemory("user_episode_lifecycle", {
      category: "other", key: "interest:hiking", value: "Enjoys hiking on weekends.",
      evidence: "I love hiking on weekends.", confidence: 0.95, sourceType: "user_statement",
      sourceMetadata: { sourceTurnReferences: [{ turnId: "turn-hiking-source" }] }
    });
    await memory.setConversationContext("user_episode_lifecycle", "hiking-chat", [
      "I love hiking on weekends.",
      "Victoria: What kind of outdoor routine feels manageable?",
      "I'd like to find a steady weekend trail routine."
    ]);
    const llm = new MockLlmAdapter();
    llm.classifyMessage = async ({ userMessage }) => ({
      type: "general_finance", confidence: 0.9, summary: userMessage, needsClarification: false
    });
    let episodicSummariesSeen: readonly { readonly id: string; readonly summary: string; readonly createdAt: string }[] = [];
    const agent = new VictoriaAgent({
      llm, memory, tools: new MockVictoriaTools(),
      conversationResponder: { async respond(input) {
        episodicSummariesSeen = input.contextSnapshot?.episodicSummaries ?? [];
        return input.baselineReply;
      } },
      episodicMemorySummarizer: {
        async summarize() {
          return {
            summary: "The user enjoys hiking and wants a steady weekend trail routine.",
            evidenceQuotes: ["I love hiking on weekends."], confidence: 0.94, sensitivity: "ordinary"
          };
        }
      }
    });

    await expect(agent.finishConversation("user_episode_lifecycle", "hiking-chat", [
      { turnId: "turn-hiking-source", userMessage: "I love hiking on weekends." }
    ])).resolves.toBe(true);
    const episode = (await memory.listConversationalMemories("user_episode_lifecycle"))
      .find((item) => item.sourceMetadata?.memoryKind === "episodic_summary");
    expect(episode?.sourceMetadata?.sourceTurnReferences).toEqual([{
      turnId: "turn-hiking-source", userMessage: "I love hiking on weekends."
    }]);

    await memory.correctMemory("user_episode_lifecycle", fact.id, "I don't enjoy hiking anymore.");
    const later = await agent.respond({ userId: "user_episode_lifecycle", conversationId: "later-chat",
      message: "Can you help me plan a steady weekend trail routine?" });

    expect(later.message).not.toContain("note from an earlier conversation");
    expect(later.message).not.toContain("enjoys hiking");
    expect(episodicSummariesSeen).toEqual([]);
  });

  it("stores a grounded episode when an authenticated caller explicitly finishes a conversation", async () => {
    const memory = new MockMemoryProvider();
    await memory.setConversationContext("user_finish", "finished", [
      "I want to stop ordering lunch when work gets stressful.",
      "Victoria: We can look for a simple lunch plan that fits your week.",
      "I would like to pack lunch on office days and save for a trip."
    ]);
    let calls = 0;
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools(),
      episodicMemorySummarizer: {
        async summarize({ userMessages }) {
          calls += 1;
          return {
            summary: "The user wants to pack lunch on office days and save for a trip.",
            evidenceQuotes: [userMessages[1]!], confidence: 0.93, sensitivity: "ordinary"
          };
        }
      }
    });

    await expect(agent.finishConversation("user_finish", "finished")).resolves.toBe(true);
    await expect(agent.finishConversation("user_finish", "finished")).resolves.toBe(true);
    expect(calls).toBe(1);
    expect(await memory.listConversationalMemories("user_finish")).toMatchObject([{
      category: "other", key: expect.stringMatching(/^episode:/),
      value: "The user wants to pack lunch on office days and save for a trip."
    }]);
    await expect(agent.finishConversation("other_user", "finished")).resolves.toBe(false);
  });

  it("only retrieves relevant, well-formed episode summaries within the freshness window", () => {
    const now = new Date("2026-10-15T14:00:00.000Z");
    const validated = validateEpisodicSummary({
      summary: "The user is exploring a steady weekend savings routine.",
      evidenceQuotes: ["I am trying to make weekends less expensive."],
      confidence: 0.93,
      sensitivity: "ordinary"
    }, ["I am trying to make weekends less expensive."]);
    expect(validated).not.toBeNull();
    const memory = {
      ...validated!, id: "episode-test", createdAt: new Date(now.getTime() - 10_000).toISOString()
    };
    expect(isUsableEpisodicSummary(memory, "I want a steady weekend savings routine.", now)).toBe(true);
    expect(isUsableEpisodicSummary({ ...memory, semanticSimilarity: SEMANTIC_MEMORY_RECALL_MIN_SIMILARITY + 0.03 },
      "Can you help me make Saturday saving plans easier to keep?", now)).toBe(true);
    expect(isUsableEpisodicSummary({ ...memory, semanticSimilarity: SEMANTIC_MEMORY_RECALL_MIN_SIMILARITY - 0.03 },
      "Can you help me make Saturday saving plans easier to keep?", now)).toBe(false);
    expect(isUsableEpisodicSummary(memory, "I'm thinking about a new project at work.", now)).toBe(false);
    expect(isUsableEpisodicSummary({
      ...memory, createdAt: new Date(now.getTime() - EPISODIC_MEMORY_MAX_AGE_MS - 1).toISOString()
    }, "I want a steady weekend savings routine.", now)).toBe(false);
    expect(isUsableEpisodicSummary({
      ...memory, createdAt: new Date(now.getTime() + 1).toISOString()
    }, "I want a steady weekend savings routine.", now)).toBe(false);
  });

  it("does not send transaction-detail messages to the episode summarizer", async () => {
    const memory = new MockMemoryProvider();
    const llm = new MockLlmAdapter();
    llm.classifyMessage = async ({ userMessage }) => ({
      type: "general_finance", confidence: 0.9, summary: userMessage, needsClarification: false
    });
    let calls = 0;
    const agent = new VictoriaAgent({
      llm, memory, tools: new MockVictoriaTools(),
      episodicMemorySummarizer: {
        async summarize() {
          calls += 1;
          return null;
        }
      }
    });
    for (let turn = 1; turn <= 11; turn += 1) {
      await agent.respond({
        userId: "user_episode_sensitive", conversationId: "transactions",
        message: `I spent $${turn} at a store yesterday.`
      });
    }
    expect(calls).toBe(0);
    expect(await memory.listConversationalMemories("user_episode_sensitive")).toEqual([]);
  });

  it("uses episode coverage checkpoints to summarize only previously uncovered turns", async () => {
    const memory = new MockMemoryProvider();
    const summarized: string[][] = [];
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools(),
      episodicMemorySummarizer: {
        async summarize({ userMessages }) {
          summarized.push([...userMessages]);
          return {
            summary: "The user is working toward a practical, repeatable everyday routine.",
            evidenceQuotes: [userMessages[0]!], confidence: 0.92, sensitivity: "ordinary"
          };
        }
      }
    });
    const first = [
      "I want a practical routine for weeknights after work.",
      "Victoria: What kind of routine might fit your evenings?",
      "I would like to build a repeatable walk after dinner."
    ];
    const firstRefs = [
      { turnId: "episode-turn-1", userMessage: first[0]! },
      { turnId: "episode-turn-2", userMessage: first[2]! }
    ];
    await memory.setConversationContext("episode-coverage-user", "episode-coverage-chat", first);
    await agent.finishConversation("episode-coverage-user", "episode-coverage-chat", firstRefs);

    const second = [...first, "Victoria: Would a short route feel manageable?",
      "I can try a shorter path on the busiest evenings.",
      "Victoria: What would help you remember the plan?",
      "A reminder on my calendar would make that easier to keep doing."];
    const allRefs = [...firstRefs, {
      turnId: "episode-turn-3", userMessage: "I can try a shorter path on the busiest evenings."
    }, { turnId: "episode-turn-4", userMessage: "A reminder on my calendar would make that easier to keep doing." }];
    await memory.setConversationContext("episode-coverage-user", "episode-coverage-chat", second);
    await agent.finishConversation("episode-coverage-user", "episode-coverage-chat", allRefs);

    expect(summarized).toHaveLength(2);
    expect(summarized[1]).toEqual([
      "I can try a shorter path on the busiest evenings.",
      "A reminder on my calendar would make that easier to keep doing."
    ]);
    const episodes = (await memory.listConversationalMemories("episode-coverage-user"))
      .filter((item) => item.sourceMetadata?.memoryKind === "episodic_summary");
    expect(episodes).toHaveLength(2);
    expect(episodes.some((episode) => {
      const coverage = episode.sourceMetadata?.summaryCoverage;
      if (typeof coverage !== "object" || coverage === null || !("coveredTurnIds" in coverage) ||
          !Array.isArray(coverage.coveredTurnIds)) return false;
      return coverage.coveredTurnIds.includes("episode-turn-3");
    })).toBe(true);
  });
});
