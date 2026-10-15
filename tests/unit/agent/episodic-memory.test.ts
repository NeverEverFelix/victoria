import { describe, expect, it } from "vitest";
import { MockLlmAdapter, MockMemoryProvider, MockVictoriaTools, VictoriaAgent } from "../../../src/agent/index.js";
import { EPISODIC_MEMORY_MAX_AGE_MS, isUsableEpisodicSummary, validateEpisodicSummary } from "../../../src/agent/memory/episodic-summary.js";

describe("episodic memory summaries", () => {
  it("summarizes context before the short-term window rolls over and retrieves the episode later", async () => {
    const memory = new MockMemoryProvider();
    const llm = new MockLlmAdapter();
    llm.classifyMessage = async ({ userMessage }) => ({
      type: "general_finance", confidence: 0.9, summary: userMessage, needsClarification: false
    });
    const summarizedChunks: string[][] = [];
    const agent = new VictoriaAgent({
      llm, memory, tools: new MockVictoriaTools(),
      episodicMemorySummarizer: {
        async summarize({ userMessages }) {
          summarizedChunks.push([...userMessages]);
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
    expect(summarizedChunks[0]).toHaveLength(4);
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
    expect(validateEpisodicSummary(valid, messages)).toMatchObject({ category: "other", sourceType: "system_inference" });
    expect(validateEpisodicSummary({ ...valid, evidenceQuotes: ["I have a different job now."] }, messages)).toBeNull();
    expect(validateEpisodicSummary({ ...valid, sensitivity: "sensitive" }, messages)).toBeNull();
    expect(validateEpisodicSummary({ ...valid, confidence: 0.6 }, messages)).toBeNull();
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
});
