import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMockAgentTeamSpecialists,
  InMemoryConversationSavingsEventStore,
  MockLlmAdapter,
  MockMemoryProvider,
  MockVictoriaTools,
  VictoriaAgent
} from "../../../src/agent/index.js";
import type { AgentTeamSpecialists } from "../../../src/agent/index.js";
import type { UserHabit } from "../../../src/agent/types.js";
import type { SavingsEntry, SavingsEvent } from "../../../src/domain/savings/types.js";
import type { PendingGoalAllocationActionStore, PersistedPendingGoalAllocationAction } from "../../../src/agent/pending-goal-allocation-store.js";
import type { PendingAmountClarificationStore } from "../../../src/agent/pending-amount-clarification-store.js";
import type { PendingEntryCorrectionStore, PersistedPendingEntryCorrection } from "../../../src/agent/pending-entry-correction-store.js";
import type { PendingSavingsActionStore, PersistedPendingSavingsAction } from "../../../src/agent/pending-savings-action-store.js";
import type { ConversationResponderInput } from "../../../src/agent/conversation-responder.js";

describe("VictoriaAgent", () => {
  it("answers a separate ordinary question while keeping an avoided-spend suggestion pending", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const responder = vi.fn(async ({ message }: ConversationResponderInput) =>
      message === "What are good podcasts for walks?"
        ? "For a relaxed walk, try a conversational interview podcast or a short nature series."
        : "I can help with that.");
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "avoided_spend", confidence: 0.95, amountCents: 2_000,
        summary: message, needsClarification: false
      } }) }, companionVoice: { respond: async () =>
        "For a relaxed walk, try a conversational interview podcast or a short nature series. Would you like me to record $20.00 in your Victoria savings ledger?" } }
    });
    const request = { userId: "mixed_everyday_question_user", conversationId: "mixed_everyday_question_chat" };

    const mixed = await agent.respond({ ...request,
      message: "I skipped a $20 book. What are good podcasts for walks?" });

    expect(mixed.message).toContain("conversational interview podcast");
    expect(mixed.message).toMatch(/record.*\$20\.00|\$20\.00.*record/i);
    expect(mixed.decision.action).toBe("suggest_savings");
    expect(mixed.decision.proposal?.status).toBe("pending");
    expect(responder).not.toHaveBeenCalled();
    expect(mixed.message.match(/Would you like me to record/gi)).toHaveLength(1);
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);

    const approved = await agent.respond({ ...request, message: "Yes" });
    expect(approved.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(request.userId)).toHaveLength(1);
  });

  it("answers an ordinary question before the avoided-spend statement", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const responder = vi.fn(async () => "A quick lentil soup is an easy dinner option.");
    const companionVoice = vi.fn(async ({ contextSnapshot }: { contextSnapshot?: { currentMessage: string } }) => {
      expect(contextSnapshot?.currentMessage).toBe("What could I cook for dinner? I avoided ordering takeout for $24.");
      return "A quick lentil soup is an easy dinner option. Would you like me to record $24.00 in your Victoria savings ledger?";
    });
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "avoided_spend", confidence: 0.95, amountCents: 2_400,
        summary: message, needsClarification: false
      } }) }, companionVoice: { respond: companionVoice } }
    });
    const request = { userId: "leading_question_mixed_user", conversationId: "leading_question_mixed_chat" };

    const mixed = await agent.respond({ ...request,
      message: "What could I cook for dinner? I avoided ordering takeout for $24." });

    expect(mixed.message).toContain("quick lentil soup");
    expect(mixed.message).toMatch(/record.*\$24\.00|\$24\.00.*record/i);
    expect(mixed.decision.action).toBe("suggest_savings");
    expect(mixed.decision.proposal?.status).toBe("pending");
    expect(responder).not.toHaveBeenCalled();
    expect(companionVoice).toHaveBeenCalledOnce();
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("does not ask for an explicit avoided-spend amount a second time on a mixed turn", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const companionVoice = vi.fn(async () =>
      "Try keeping Sunday cooking flexible by choosing a window when you can. Would you like me to record the avoided $24 takeout in your Victoria savings ledger?");
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { async respond() { return "Duplicate general reply."; } },
      specialists: {
        ...base,
        financialMoment: { analyze: async ({ message }) => ({ classification: {
          type: "avoided_spend", confidence: 0.95, amountCents: 2_400,
          summary: message, needsClarification: true
        } }) },
        savingsReasoning: { assess: async () => ({
          outcome: "ask", confidence: 0.9, question: "I want to make sure I have the amount right. Could you clarify it?"
        }) },
        companionVoice: { respond: companionVoice }
      }
    });
    const request = { userId: "mixed_explicit_amount_user", conversationId: "mixed_explicit_amount_chat" };

    const response = await agent.respond({ ...request,
      message: "I skipped a $24 takeout order last night. My manager sometimes schedules Sundays—what's one flexible way to keep cooking with friends? I might want to log the savings too." });

    expect(response.decision.action).toBe("suggest_savings");
    expect(response.decision.proposal?.status).toBe("pending");
    expect(response.message).toContain("Try keeping Sunday cooking flexible");
    expect(response.message).not.toContain("clarify it");
    expect(response.message.match(/Would you like me to record/gi)).toHaveLength(1);
    expect(companionVoice).toHaveBeenCalledOnce();
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("uses the canonical context's selected memories for conversational replies", async () => {
    const memory = new MockMemoryProvider();
    await memory.rememberConversationalMemory("snapshot_memory_user", {
      category: "goal", key: "goal:japan_trip", value: "Saving for a trip to Japan.",
      evidence: "My goal is to save for a trip to Japan.", confidence: 0.96, sourceType: "user_statement"
    });
    await memory.rememberConversationalMemory("snapshot_memory_user", {
      category: "preference", key: "food:spicy", value: "Enjoys spicy food.",
      evidence: "I enjoy spicy food.", confidence: 0.96, sourceType: "user_statement"
    });
    await memory.rememberConversationalMemory("snapshot_memory_user", {
      category: "other", key: "inference:food", value: "May enjoy spicy food.",
      evidence: "Inferred from a restaurant choice.", confidence: 0.96, sourceType: "system_inference"
    });
    const originalGetMemory = memory.getMemoryForUser.bind(memory);
    vi.spyOn(memory, "getMemoryForUser").mockImplementation(async (userId) => {
      const result = await originalGetMemory(userId);
      return { ...result, conversationalMemories: await memory.listCurrentConversationalMemories(userId) };
    });
    const base = createMockAgentTeamSpecialists();
    const responder = vi.fn(async (input: ConversationResponderInput) => input.baselineReply);
    let specialistSnapshot: Parameters<AgentTeamSpecialists["financialMoment"]["analyze"]>[0]["contextSnapshot"];
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools(),
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { analyze: async ({ message, contextSnapshot }) => {
        specialistSnapshot = contextSnapshot;
        return { classification: {
          type: "general_finance", confidence: 0.9, summary: message, needsClarification: false
        } };
      } } }
    });

    await agent.respond({ userId: "snapshot_memory_user", conversationId: "snapshot_memory_chat",
      message: "What should I keep in mind for my Japan trip?" });

    const input = responder.mock.calls[0]?.[0];
    expect(input?.financialContext?.selectedMemoryFacts.map(({ id }) => id)).toEqual(["memory_1", "memory_2"]);
    expect(input?.memories.map(({ id }) => id)).toEqual(["memory_1", "memory_2"]);
    expect(input?.memories[0]).toMatchObject({ provenance: "user_statement", value: "Saving for a trip to Japan." });
    expect(input?.contextSnapshot).toMatchObject({
      currentMessage: "What should I keep in mind for my Japan trip?",
      selectedMemories: [{ id: "memory_1" }, { id: "memory_2" }],
      financialContext: input?.financialContext
    });
    expect(input?.contextSnapshot).toBe(specialistSnapshot);
    expect(specialistSnapshot?.selectedMemories).toEqual(input?.contextSnapshot?.selectedMemories);
    expect(specialistSnapshot?.selectedMemories.map(({ provenance }) => provenance)).toEqual([
      "user_statement", "user_statement"
    ]);
  });

  it("keeps a relevant episodic summary separate from current sourced memory facts in the context snapshot", async () => {
    const memory = new MockMemoryProvider();
    await memory.rememberConversationalMemory("episode_snapshot_user", {
      category: "other", key: "episode:weekend-trails",
      value: "The user enjoys hiking and wants a steady weekend trail routine.",
      evidence: "I love hiking on weekends.", confidence: 0.94, sourceType: "system_inference",
      sourceMetadata: { memoryKind: "episodic_summary", evidenceCount: 1 }
    });
    const base = createMockAgentTeamSpecialists();
    const responder = vi.fn(async (input: ConversationResponderInput) => input.baselineReply);
    let specialistSnapshot: Parameters<AgentTeamSpecialists["financialMoment"]["analyze"]>[0]["contextSnapshot"];
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools(),
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { analyze: async ({ message, contextSnapshot }) => {
        specialistSnapshot = contextSnapshot;
        return { classification: {
          type: "general_finance", confidence: 0.9, summary: message, needsClarification: false
        } };
      } } }
    });

    await agent.respond({ userId: "episode_snapshot_user", conversationId: "episode_snapshot_chat",
      message: "Can you help me plan a steady weekend trail routine?" });

    const snapshot = responder.mock.calls[0]?.[0].contextSnapshot;
    expect(snapshot?.episodicSummaries).toMatchObject([{
      id: "memory_1", summary: "The user enjoys hiking and wants a steady weekend trail routine."
    }]);
    expect(snapshot?.selectedMemories).toEqual([]);
    expect(snapshot?.financialContext?.selectedMemoryFacts).toEqual([]);
    expect(specialistSnapshot?.episodicSummaries).toEqual(snapshot?.episodicSummaries);
    expect(specialistSnapshot?.selectedMemories).toEqual(snapshot?.selectedMemories);
  });

  it("shares one immutable snapshot across all three specialists in a financial turn", async () => {
    const snapshots: NonNullable<Parameters<AgentTeamSpecialists["financialMoment"]["analyze"]>[0]["contextSnapshot"]>[] = [];
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools: new MockVictoriaTools(),
      specialists: {
        financialMoment: { async analyze(input) {
          if (input.contextSnapshot) snapshots.push(input.contextSnapshot);
          return { classification: {
            type: "avoided_spend", confidence: 0.95, amountCents: 2_000,
            summary: "The user avoided a $20 purchase.", needsClarification: false
          } };
        } },
        savingsReasoning: { async assess(input) {
          if (input.contextSnapshot) snapshots.push(input.contextSnapshot);
          return { outcome: "suggest", confidence: 0.95, amountCents: 2_000,
            source: "user_provided", rationale: "The user stated the amount." };
        } },
        companionVoice: { async respond(input) {
          if (input.contextSnapshot) snapshots.push(input.contextSnapshot);
          return "You chose to wait on the $20 purchase. Would you like to record that amount in Victoria's mocked savings ledger?";
        } }
      }
    });

    await agent.respond({ userId: "shared_specialist_snapshot_user", conversationId: "shared_specialist_snapshot_chat",
      message: "I almost bought a $20 book but decided to wait." });

    expect(snapshots).toHaveLength(3);
    expect(snapshots[1]).toBe(snapshots[0]);
    expect(snapshots[2]).toBe(snapshots[0]);
    expect(Object.isFrozen(snapshots[0])).toBe(true);
    expect(snapshots[0]?.currentMessage).toBe("I almost bought a $20 book but decided to wait.");
  });

  it("routes an unpunctuated financial reflection to conversation without opening a savings action", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const responder = vi.fn(async () => "A promotion can change the choices around money. What feels most uncertain right now?");
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "general_finance", confidence: 0.9, summary: message, needsClarification: false
      } }) } }
    });

    const response = await agent.respond({ userId: "financial_reflection_user", conversationId: "financial_reflection_chat",
      message: "I've been anxious about money ever since I got promoted" });

    expect(response.message).toContain("promotion can change the choices");
    expect(response.decision.action).toBe("reflect");
    expect(responder).toHaveBeenCalledOnce();
    expect(await tools.listSavingsEntries("financial_reflection_user")).toEqual([]);
    expect(response.decision.proposal).toBeUndefined();
  });

  it("treats anxiety about saving money as reflection unless a concrete action is requested", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const responder = vi.fn(async () => "That sounds stressful. What part of saving feels hardest right now?");
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "avoided_spend", confidence: 0.9, summary: message, needsClarification: false
      } }) } }
    });

    const response = await agent.respond({ userId: "saving_anxiety_user", conversationId: "saving_anxiety_chat",
      message: "I'm stressed about saving money" });

    expect(response.message).toContain("What part of saving feels hardest");
    expect(response.decision.action).toBe("reflect");
    expect(responder).toHaveBeenCalledOnce();
    expect(response.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries("saving_anxiety_user")).toEqual([]);
  });

  it("routes anxiety about saving for a goal as reflection without creating an action", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const responder = vi.fn(async () => "Planning for retirement can feel distant. What part feels most uncertain?");
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "avoided_spend", confidence: 0.9, summary: message, needsClarification: false
      } }) } }
    });

    const response = await agent.respond({ userId: "retirement_anxiety_user", conversationId: "retirement_anxiety_chat",
      message: "I'm anxious about saving for retirement" });

    expect(response.message).toContain("Planning for retirement");
    expect(response.decision.action).toBe("reflect");
    expect(responder).toHaveBeenCalledOnce();
    expect(response.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries("retirement_anxiety_user")).toEqual([]);
  });

  it("routes worries about not saving enough as reflection when no amount or action is requested", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const responder = vi.fn(async () => "Many people worry they aren't saving enough. What would feel more secure?");
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "avoided_spend", confidence: 0.9, summary: message, needsClarification: false
      } }) } }
    });

    const response = await agent.respond({ userId: "saving_enough_anxiety_user", conversationId: "saving_enough_anxiety_chat",
      message: "I'm worried I don't save enough for retirement" });

    expect(response.message).toContain("What would feel more secure");
    expect(response.decision.action).toBe("reflect");
    expect(responder).toHaveBeenCalledOnce();
    expect(response.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries("saving_enough_anxiety_user")).toEqual([]);
  });

  it("routes guilt about spending as reflection without opening a regret workflow", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const responder = vi.fn(async () => "You don't have to judge yourself for that. What feels most important now?");
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "regretful_spend", confidence: 0.9, summary: message, needsClarification: false
      } }) } }
    });

    const response = await agent.respond({ userId: "spending_guilt_user", conversationId: "spending_guilt_chat",
      message: "I feel guilty about my spending lately" });

    expect(response.message).toContain("What feels most important now");
    expect(response.decision.action).toBe("reflect");
    expect(responder).toHaveBeenCalledOnce();
    expect(response.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries("spending_guilt_user")).toEqual([]);
  });

  it("routes a free-standing nonfinancial statement to the conversational responder", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const responder = vi.fn(async () => "Starting a new job can bring a lot of hope. What are you looking forward to most?");
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "general_finance", confidence: 0.9, summary: message, needsClarification: false
      } }) } }
    });

    const response = await agent.respond({ userId: "unpunctuated_topic_user", conversationId: "unpunctuated_topic_chat",
      message: "I feel hopeful about starting my new job" });

    expect(response.message).toContain("Starting a new job can bring a lot of hope");
    expect(response.decision.action).toBe("reflect");
    expect(responder).toHaveBeenCalledOnce();
    expect(response.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries("unpunctuated_topic_user")).toEqual([]);
  });

  it("routes an unpunctuated budget-overwhelm reflection without opening a savings proposal", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const responder = vi.fn(async () => "That sounds like a lot to hold at once. What part of the budget feels hardest to face?");
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "avoided_spend", confidence: 0.95, amountCents: 5_000, summary: message, needsClarification: false
      } }) } }
    });

    const response = await agent.respond({ userId: "budget_reflection_user", conversationId: "budget_reflection_chat",
      message: "My budget feels overwhelming today" });

    expect(response.message).toContain("hardest to face");
    expect(response.decision.action).toBe("reflect");
    expect(response.decision.proposal).toBeUndefined();
    expect(responder).toHaveBeenCalledOnce();
    expect(await tools.listSavingsEntries("budget_reflection_user")).toEqual([]);
  });

  it("keeps a budget reflection useful when the responder fails after an avoided-spend classification", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const fallbackObserver = vi.fn();
    const responder = vi.fn(async () => { throw new Error("provider unavailable"); });
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder },
      onConversationReplyFallback: fallbackObserver,
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "avoided_spend", confidence: 0.95, amountCents: 5_000, summary: message, needsClarification: false
      } }) } }
    });

    const response = await agent.respond({ userId: "budget_fallback_user", conversationId: "budget_fallback_chat",
      message: "My budget feels overwhelming today" });

    expect(response.message).toContain("one piece at a time");
    expect(response.message).toContain("what's due soon");
    expect(response.decision.action).toBe("reflect");
    expect(response.decision.proposal).toBeUndefined();
    expect(responder).toHaveBeenCalledOnce();
    expect(fallbackObserver).toHaveBeenCalledExactlyOnceWith("provider_error");
    expect(await tools.listSavingsEntries("budget_fallback_user")).toEqual([]);
  });

  it("keeps a promotion-related financial reflection focused when conversational generation fails", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const fallbackObserver = vi.fn();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { async respond() { throw new Error("provider unavailable"); } },
      onConversationReplyFallback: fallbackObserver,
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "general_finance", confidence: 0.9, summary: message, needsClarification: false
      } }) } }
    });
    const userId = "promotion_reflection_fallback_user";

    const response = await agent.respond({ userId,
      message: "I've been anxious about money ever since I got promoted" });

    expect(response.message).toContain("A promotion can bring a lot of change");
    expect(response.message).toContain("What feels most uncertain");
    expect(response.decision.action).toBe("reflect");
    expect(response.decision.proposal).toBeUndefined();
    expect(fallbackObserver).toHaveBeenCalledExactlyOnceWith("provider_error");
    expect(await tools.listSavingsEntries(userId)).toEqual([]);
  });

  it("responds to pushback on a rigid work boundary when conversational generation fails", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { async respond() { throw new Error("provider unavailable"); } },
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "general_finance", confidence: 0.9, summary: message, needsClarification: false
      } }) } }
    });
    const userId = "work_boundary_fallback_user";

    const response = await agent.respond({ userId, conversationId: "work_boundary_fallback_chat",
      message: "I'm not sure I can call it non-negotiable; my manager sometimes schedules Sunday requests. What's a realistic first boundary?" });

    expect(response.message).toContain("It doesn't have to be absolute");
    expect(response.message).toContain("how much notice");
    expect(response.message).toContain("what feels realistic to try once?");
    expect(response.decision.action).toBe("reflect");
    expect(response.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries(userId)).toEqual([]);
  });

  it("uses a topic-specific fallback when the provider repeats the generic baseline", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const responder = vi.fn(async ({ baselineReply }: ConversationResponderInput) => baselineReply);
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "general_finance", confidence: 0.9, summary: message, needsClarification: false
      } }) } }
    });
    const userId = "work_boundary_generic_user";

    const response = await agent.respond({ userId, conversationId: "work_boundary_generic_chat",
      message: "That generic question doesn't help. My manager sometimes schedules Sundays, and cooking with friends matters to me. Suggest one flexible thing I can try." });

    expect(responder).toHaveBeenCalledOnce();
    expect(response.message).toContain("choosing a Sunday cooking window");
    expect(response.message).toContain("one backup time");
    expect(response.decision.action).toBe("reflect");
    expect(await tools.listSavingsEntries(userId)).toEqual([]);
  });

  it("gives a focused career-choice prompt when conversational generation fails", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { async respond() { throw new Error("provider unavailable"); } },
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "general_finance", confidence: 0.9, summary: message, needsClarification: false
      } }) } }
    });
    const response = await agent.respond({ userId: "career_fallback_user", conversationId: "career_fallback_chat",
      message: "How should I think about changing jobs?" });

    expect(response.message).toContain("work itself, growth, pay, and stability");
    expect(response.message).toContain("Which of those matters most");
    expect(response.decision.action).toBe("reflect");
    expect(response.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries("career_fallback_user")).toEqual([]);
  });

  it("records a recognized event with the exact user and conversation before amount clarification completes", async () => {
    const savingsEvents = new InMemoryConversationSavingsEventStore();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools: new MockVictoriaTools(), savingsEvents
    });
    const request = { userId: "event_lookup_user", conversationId: "event_lookup_chat" };
    const clarification = await agent.respond({ ...request, message: "I cooked instead of ordering takeout." });
    const event = clarification.decision.savingsEvent;

    expect(event).toBeDefined();
    await expect(savingsEvents.list(request.userId, request.conversationId)).resolves.toEqual([event]);
    await expect(savingsEvents.list(request.userId, "another_chat")).resolves.toEqual([]);
    await expect(savingsEvents.list("another_user", request.conversationId)).resolves.toEqual([]);
  });

  it("[INT-005] answers a combined annual projection from two distinct recurring costs without recording either", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const request = { userId: "combined_cost_user", conversationId: "combined_cost_chat" };
    await agent.respond({ ...request, message: "I canceled my $35/month yoga membership." });
    await agent.respond({ ...request, message: "No." });
    const response = await agent.respond({ ...request,
      message: "I also canceled a $20-a-month streaming service. How much would both freed-up amounts be over a year?" });
    expect(response.decision.action).toBe("reflect");
    expect(response.message).toContain("$55.00 a month");
    expect(response.message).toContain("$660.00 over 12 months");
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("answers annual math and keeps a same-turn current-month record request confirmation-gated", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const request = { userId: "projection_record_mix_user", conversationId: "projection_record_mix_chat" };
    const initial = await agent.respond({ ...request, message: "I canceled a $35/month yoga membership." });
    expect(initial.decision.proposal?.status).toBe("pending");

    const mixed = await agent.respond({ ...request,
      message: "What would that be per year, and can you record this month?" });

    expect(mixed.message).toContain("$420.00");
    expect(mixed.message).toContain("$35.00");
    expect(mixed.message).toMatch(/say yes|confirm/i);
    expect(mixed.message).toMatch(/if .*?(?:continues|stays|remains)|if the expense/i);
    expect(mixed.decision.action).toBe("ask_follow_up");
    expect(mixed.decision.proposal?.id).toBe(initial.decision.proposal?.id);
    expect(mixed.decision.proposal?.status).toBe("pending");
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);

    const approved = await agent.respond({ ...request, message: "Yes" });
    expect(approved.decision.action).toBe("create_ledger_entry");
    expect((await tools.listSavingsEntries(request.userId))[0]?.amountCents).toBe(3_500);
  });

  it("clarifies which recurring cost to record when a combined projection has multiple sources", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const request = { userId: "multi_projection_record_user", conversationId: "multi_projection_record_chat" };
    await agent.respond({ ...request, message: "I canceled a $35/month yoga membership." });
    await agent.respond({ ...request, message: "No." });
    await agent.respond({ ...request, message: "I also canceled a $20/month streaming service." });
    await agent.respond({ ...request, message: "No." });

    const mixed = await agent.respond({ ...request,
      message: "What would both be per year, and can you record one this month?" });

    expect(mixed.decision.action).toBe("ask_follow_up");
    expect(mixed.message).toContain("$55.00 a month");
    expect(mixed.message).toContain("$660.00 over 12 months");
    expect(mixed.message).toContain("$35.00");
    expect(mixed.message).toContain("$20.00");
    expect(mixed.message).toMatch(/which single monthly cost/i);
    expect(mixed.message).toMatch(/nothing has been recorded|haven't created a proposal/i);
    expect(mixed.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("preserves a pending proposal while clarifying a combined projection record request", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const request = { userId: "pending_multi_projection_user", conversationId: "pending_multi_projection_chat" };
    const initial = await agent.respond({ ...request, message: "I canceled a $35/month yoga membership." });
    expect(initial.decision.proposal?.status).toBe("pending");
    await agent.respond({ ...request, message: "I also canceled a $20/month streaming service." });

    const mixed = await agent.respond({ ...request,
      message: "What would both be per year, and can you record one this month?" });

    expect(mixed.decision.action).toBe("ask_follow_up");
    expect(mixed.message).toContain("$55.00 a month");
    expect(mixed.message).toContain("$660.00 over 12 months");
    expect(mixed.message).toMatch(/which single monthly cost/i);
    expect(mixed.message).toContain("existing $35.00 suggestion remains pending");
    expect(mixed.decision.proposal?.id).toBe(initial.decision.proposal?.id);
    expect(mixed.decision.proposal?.status).toBe("pending");
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("[ARC-006] uses model-selected references only after matching them to grounded context events", async () => {
    const tools = new MockVictoriaTools();
    const memory = new MockMemoryProvider();
    const request = { userId: "selected_cost_user", conversationId: "selected_cost_chat" };
    await memory.setConversationContext(request.userId, request.conversationId, [
      "I canceled a $35/month yoga membership.",
      "I quit a $20-a-month streaming service.",
      "I ended a $12/month music subscription."
    ]);
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools,
      contextReferenceResolver: { async resolve() { return {
        kind: "annual_projection", sourceTurnIndexes: [0, 1], confidence: 0.95
      }; } }
    });
    const response = await agent.respond({ ...request, message: "What is the yearly total for yoga and streaming?" });
    expect(response.decision.action).toBe("reflect");
    expect(response.message).toContain("$660.00");
    expect(response.message).not.toContain("$804.00");
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("[APR-004] answers a separate buffer request after declining a pending proposal", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const request = { userId: "buffer_advice_user", conversationId: "buffer_advice_chat" };
    await agent.respond({ ...request, message: "I canceled a yoga membership that cost $35 a month." });
    const response = await agent.respond({ ...request,
      message: "No, please do not record it. Just answer whether keeping that money as a buffer makes sense." });
    expect(response.decision.proposal?.status).toBe("declined");
    expect(response.message).toMatch(/buffer/i);
    expect(response.message).toContain("$35.00");
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("[ERR-001] asks whether a paraphrased completed savings request is a new occurrence", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const request = { userId: "paraphrase_repeat_user", conversationId: "paraphrase_repeat_chat" };
    await agent.respond({ ...request, message: "I made coffee at home instead of buying a $6 latte." });
    await agent.respond({ ...request, message: "Yes, record the $6 latte I skipped in the mocked savings ledger." });
    const repeat = await agent.respond({ ...request, message: "Please log that coffee I skipped for $6." });
    expect(repeat.decision.action).toBe("ask_follow_up");
    expect(repeat.message).toMatch(/separate new occurrence/i);
    expect(repeat.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries(request.userId)).toHaveLength(1);
    const separate = await agent.respond({ ...request,
      message: "Today I made coffee at home instead of buying another $6 latte." });
    expect(separate.decision.action).toBe("suggest_savings");
    expect(await tools.listSavingsEntries(request.userId)).toHaveLength(1);
    const approved = await agent.respond({ ...request, message: "Yes" });
    expect(approved.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(request.userId)).toHaveLength(2);
  });

  it.each([
    "I stopped my $35-a-month pottery class last week. Help me plan what to do with that money.",
    "I cancelled a pottery class that was $35/month. What should I do with the freed-up amount?",
    "I quit a class that cost $35 a month. What might that be per year?",
    "I quit the pottery class I paid $35 per month for. How might I plan for it?"
  ])("[INT-005] grounds a clearly ended recurring cost across common cadence wording: %s", async (message) => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const response = await agent.respond({ userId: "ended_cadence_user", conversationId: message, message });
    expect(response.decision.classification.type).toBe("avoided_spend");
    expect(response.decision.suggestion?.amountCents).toBe(3500);
    expect(response.message).not.toMatch(/what did you avoid spending on|how much would it have cost/i);
    expect(await tools.listSavingsEntries("ended_cadence_user")).toEqual([]);
  });

  it("[APR-004] respects a compound refusal and answers conditional annual math without another proposal", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const request = { userId: "compound_decline_user", conversationId: "compound_decline_chat" };
    await agent.respond({ ...request, message: "I stopped a class that cost me $35 each month." });
    const response = await agent.respond({ ...request, message: "No. Do not record it. Just answer the annual math, please." });
    expect(response.decision.proposal?.status).toBe("declined");
    expect(response.message).toContain("$420.00");
    expect(response.message).not.toMatch(/would you like me to record|confirm or decline/i);
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("[APR-004] answers a read-only planning question while a proposal is pending", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const request = { userId: "pending_projection_user", conversationId: "pending_projection_chat" };
    await agent.respond({ ...request, message: "I stopped a class that cost me $35 each month." });
    const response = await agent.respond({ ...request, message: "Maybe later. What would that add up to in a year if I kept it aside each month?" });
    expect(response.message).toContain("$420.00");
    expect(response.message).not.toMatch(/clear yes or no|confirm or decline/i);
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
    const decline = await agent.respond({ ...request, message: "No." });
    expect(decline.decision.proposal?.status).toBe("declined");
  });

  it("[APR-004] lets a separate read-only question through without approving the pending entry", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: message.includes("What options") ? "general_finance" : "avoided_spend",
        confidence: 0.9, summary: message, needsClarification: false,
        ...(message.includes("What options") ? {} : { amountCents: 3500 })
      } }) } }
    });
    const request = { userId: "pending_advice_user", conversationId: "pending_advice_chat" };
    await agent.respond({ ...request, message: "I skipped a $35 purchase." });
    const answer = await agent.respond({ ...request, message: "What options do I have for thinking about that amount?" });
    expect(answer.decision.action).toBe("reflect");
    expect(answer.message).not.toMatch(/confirm or decline|clear yes or no/i);
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
    const approved = await agent.respond({ ...request, message: "Yes" });
    expect(approved.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(request.userId)).toHaveLength(1);
  });

  it("[MEM-002] learns a stable volunteered fact during a read-only topic shift with an action pending", async () => {
    const tools = new MockVictoriaTools();
    const memory = new MockMemoryProvider();
    const responderInputs: Parameters<NonNullable<ConstructorParameters<typeof VictoriaAgent>[0]["conversationResponder"]>["respond"]>[0][] = [];
    const extractor = { extract: vi.fn(async () => [{
      category: "other", key: "interest:hiking", value: "Enjoys hiking.", evidence: "I love hiking.",
      confidence: 0.95, subject: "user", assertion: "affirmed", stability: "stable", sensitivity: "ordinary"
    }]) };
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools,
      conversationalMemoryExtractor: extractor,
      conversationResponder: { async respond(input) {
        responderInputs.push(input);
        return "A local trail could make for an easy weekend outing.";
      } }
    });
    const request = { userId: "pending_memory_user", conversationId: "pending_memory_chat" };
    await agent.respond({ ...request, message: "I almost bought a $19.95 book but decided to wait." });

    const answer = await agent.respond({ ...request,
      message: "I love hiking. Can you suggest a weekend plan?" });

    expect(answer.message).toContain("local trail");
    const learnedSnapshot = responderInputs.at(-1)!.contextSnapshot!;
    expect(learnedSnapshot.pendingAction).toBe("savings_entry");
    expect(learnedSnapshot.selectedMemories).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "interest:hiking" })])
    );
    expect(learnedSnapshot.conversationSavingsEvents).toEqual([]);
    expect(extractor.extract).toHaveBeenCalledTimes(2);
    expect((await memory.listConversationalMemories(request.userId)).map(({ key }) => key)).toContain("interest:hiking");
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
    const approval = await agent.respond({ ...request, message: "Yes" });
    expect(approval.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(request.userId)).toHaveLength(1);
  });

  it("preserves a selected annual planning reference through a learned read-only topic switch", async () => {
    const tools = new MockVictoriaTools();
    const memory = new MockMemoryProvider();
    const base = createMockAgentTeamSpecialists();
    const responder = vi.fn(async (input: ConversationResponderInput) => {
      if (input.pendingAction !== "savings_entry") throw new Error("Expected the pending savings action context.");
      return "A nearby trail could be a relaxed weekend plan.";
    });
    const extractor = { extract: vi.fn(async () => [{
      category: "other" as const, key: "interest:hiking", value: "Enjoys hiking.", evidence: "I love hiking.",
      confidence: 0.95, subject: "user" as const, assertion: "affirmed" as const,
      stability: "stable" as const, sensitivity: "ordinary" as const
    }]) };
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools,
      conversationResponder: { respond: responder }, conversationalMemoryExtractor: extractor,
      specialists: { ...base, companionVoice: { respond: async () =>
        "The gym is covered at $35 monthly or $420 annually if coverage continues. Which planning target do you prefer?" } }
    });
    const request = { userId: "planning_snapshot_user", conversationId: "planning_snapshot_chat" };
    const initial = await agent.respond({ ...request,
      message: "My employer now covers my $35 monthly gym membership." });
    const selected = await agent.respond({ ...request, message: "annual" });
    expect(selected.decision.planningChoice?.selectedHorizon).toBe("annual");

    const topic = await agent.respond({ ...request,
      message: "I love hiking. Can you suggest a weekend plan?" });

    const input = responder.mock.calls[0]?.[0];
    const workflow = input?.contextSnapshot?.financialContext?.workflowState;
    expect(topic.message).toContain("nearby trail");
    expect(input?.contextSnapshot?.pendingAction).toBe("savings_entry");
    expect(input?.contextSnapshot?.selectedMemories).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "interest:hiking" })])
    );
    expect(workflow?.status).toBe("awaiting_confirmation");
    expect(workflow).toMatchObject({
      actionId: initial.decision.proposal?.actionId,
      proposalId: initial.decision.proposal?.id,
      pendingRecordableAmountCents: 3500,
      planningChoice: { annualProjectionCents: 42000 },
      selectedPlanningPeriod: "annual",
      selectedPlanningAmountCents: 42000,
      selectedPlanningMeaning: "conditional_projection"
    });
    expect(input?.contextSnapshot?.financialContext?.conversationSavingsEvents).toEqual([]);
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);

    const approved = await agent.respond({ ...request, message: "yes" });
    expect(approved.decision.action).toBe("create_ledger_entry");
    expect((await tools.listSavingsEntries(request.userId))[0]?.amountCents).toBe(3500);
  });

  it("learns a distinct provider-extracted fact when deterministic extraction already found an interest", async () => {
    const memory = new MockMemoryProvider();
    const extractor = { extract: vi.fn(async () => [{
      category: "preference", key: "communication:brief", value: "Prefers brief, practical check-ins.",
      evidence: "I prefer brief, practical check-ins.", confidence: 0.95, subject: "user", assertion: "affirmed",
      stability: "stable", sensitivity: "ordinary"
    }]) };
    const base = createMockAgentTeamSpecialists();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools(),
      conversationalMemoryExtractor: extractor,
      conversationResponder: { async respond() { return "A short checklist may be a good fit."; } },
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "general_finance", confidence: 0.9, summary: message, needsClarification: false
      } }) } }
    });
    const request = { userId: "mixed_memory_user", conversationId: "mixed_memory_chat" };

    const response = await agent.respond({ ...request,
      message: "I love hiking. I prefer brief, practical check-ins. Can you help me plan?" });

    expect(response.message).toContain("short checklist");
    expect(extractor.extract).toHaveBeenCalledOnce();
    const keys = (await memory.listConversationalMemories(request.userId)).map(({ key }) => key);
    expect(keys.some((key) => key.startsWith("interest:hiking"))).toBe(true);
    expect(keys).toContain("communication:brief");
  });

  it("[APR-004] lets a read-only financial reflection without question punctuation through a pending proposal", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    let receivedResponderInput: ConversationResponderInput | undefined;
    const responder = vi.fn(async (input: ConversationResponderInput) => {
      receivedResponderInput = input;
      return "A promotion can change your options while still leaving the choices to you. What feels most uncertain right now?";
    });
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: message.includes("anxious") ? "general_finance" : "avoided_spend",
        confidence: 0.9, summary: message, needsClarification: false,
        ...(message.includes("anxious") ? {} : { amountCents: 3_500 })
      } }) } }
    });
    const request = { userId: "pending_reflection_user", conversationId: "pending_reflection_chat" };
    await agent.respond({ ...request, message: "I skipped a $35 purchase." });

    const reflection = await agent.respond({ ...request,
      message: "I've been anxious about money ever since I got promoted." });

    expect(reflection.message).toContain("promotion can change your options");
    expect(reflection.decision.action).toBe("reflect");
    expect(responder).toHaveBeenCalledOnce();
    expect(receivedResponderInput?.pendingAction).toBe("savings_entry");
    expect(receivedResponderInput?.contextSnapshot?.pendingAction).toBe("savings_entry");
    expect(receivedResponderInput?.conversationSavingsEvents).toEqual([]);
    expect(receivedResponderInput?.financialContext?.conversationSavingsEvents).toEqual([]);
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
    const approved = await agent.respond({ ...request, message: "Yes" });
    expect(approved.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(request.userId)).toHaveLength(1);
  });

  it("[APR-004] lets the explicit promotion-and-budget topic switch through a pending proposal", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const responder = vi.fn(async () => "Sure. We can talk through what changed in your budget and what you want this promotion to make possible.");
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: message.includes("talk about what the promotion means") ? "general_finance" : "avoided_spend",
        confidence: 0.9, summary: message, needsClarification: false,
        ...(message.includes("talk about what the promotion means") ? {} : { amountCents: 3_500 })
      } }) } }
    });
    const request = { userId: "promotion_budget_pending_user", conversationId: "promotion_budget_pending_chat" };
    await agent.respond({ ...request, message: "I skipped a $35 purchase." });

    const reflection = await agent.respond({ ...request,
      message: "I actually want to talk about what the promotion means for my budget." });

    expect(reflection.message).toContain("what changed in your budget");
    expect(reflection.decision.action).toBe("reflect");
    expect(responder).toHaveBeenCalledOnce();
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
    const approved = await agent.respond({ ...request, message: "Yes" });
    expect(approved.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(request.userId)).toHaveLength(1);
  });

  it("[APR-004] answers a clearly read-only event-history question while preserving a pending proposal", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const memory = new MockMemoryProvider();
    await memory.rememberConversationalMemory("pending_history_user", {
      category: "other", key: "episode:event-history",
      value: "The user asked which event they mentioned first in the conversation.",
      evidence: "What event did I mention first in this conversation?",
      confidence: 0.92, sourceType: "system_inference", semanticSimilarity: 0.9,
      sourceMetadata: { memoryKind: "episodic_summary", evidenceCount: 1 }
    });
    const priorMemory = await memory.rememberConversationalMemory("pending_history_user", {
      category: "preference", key: "topic:event_history",
      value: "Prefers broad reflections on event history.",
      evidence: "I like broad reflections on event history.",
      confidence: 0.95, sourceType: "user_statement"
    });
    const correctedMemory = await memory.rememberConversationalMemory("pending_history_user", {
      category: "preference", key: "topic:event_history",
      value: "Prefers concise summaries of event history.",
      evidence: "I prefer concise summaries of event history.",
      confidence: 0.96, sourceType: "user_correction", supersedesId: priorMemory.id
    });
    let receivedEvents: readonly unknown[] | undefined;
    let receivedSnapshot: ConversationResponderInput["contextSnapshot"];
    const conversationResponder = { respond: vi.fn(async (input: ConversationResponderInput) => {
      receivedEvents = input.conversationSavingsEvents;
      receivedSnapshot = input.contextSnapshot;
      return "The first event was a skipped purchase.";
    }) };
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools, conversationResponder,
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "avoided_spend", confidence: 0.9, amountCents: 3_500, summary: message, needsClarification: false
      } }) } }
    });
    const request = { userId: "pending_history_user", conversationId: "pending_history_chat" };
    await agent.respond({ ...request, message: "I skipped a $35 purchase." });
    const answer = await agent.respond({ ...request,
      message: "What event did I mention first in this conversation? I'm asking for a summary, not to record savings." });

    expect(answer.message).toContain("The first event was a skipped purchase");
    expect(receivedEvents).toHaveLength(1);
    expect(receivedEvents?.[0]).toMatchObject({
      summary: "I skipped a $35 purchase.", userProvidedAmountCents: 3_500, provenance: "user_reported_event"
    });
    expect(receivedSnapshot?.conversationSavingsEvents).toEqual(receivedEvents);
    expect(receivedSnapshot?.financialContext?.conversationSavingsEvents).toEqual(receivedEvents);
    expect(receivedSnapshot?.episodicSummaries).toMatchObject([{
      id: "memory_1", summary: "The user asked which event they mentioned first in the conversation."
    }]);
    expect(receivedSnapshot?.selectedMemories).toEqual([
      expect.objectContaining({ id: correctedMemory.id, provenance: "user_correction" })
    ]);
    expect(receivedSnapshot?.selectedMemories?.map(({ id }) => id)).not.toContain(priorMemory.id);
    expect(answer.decision.action).toBe("reflect");
    expect(answer.decision.toolCall).toBeUndefined();
    expect(conversationResponder.respond).toHaveBeenCalledOnce();
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);

    const approved = await agent.respond({ ...request, message: "Yes" });
    expect(approved.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(request.userId)).toHaveLength(1);
  });

  it("asks for a distinguishing detail when a history question matches multiple events without a pending proposal", async () => {
    const savingsEvents = new InMemoryConversationSavingsEventStore();
    const responder = vi.fn(async () => "I found a cafe event.");
    const request = { userId: "ambiguous_history_user", conversationId: "ambiguous_history_chat" };
    const events: SavingsEvent[] = [
      { id: "history-1", userId: request.userId, type: "avoided_spend",
        summary: "I skipped coffee at North Star Cafe.", merchantName: "North Star Cafe",
        classificationConfidence: 0.95, createdAt: "2026-10-20T12:00:00.000Z" },
      { id: "history-2", userId: request.userId, type: "avoided_spend",
        summary: "I skipped coffee at North Star Cafe again.", merchantName: "North Star Cafe",
        classificationConfidence: 0.95, createdAt: "2026-10-22T12:00:00.000Z" }
    ];
    for (const event of events) await savingsEvents.record({ conversationId: request.conversationId, event });
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools: new MockVictoriaTools(),
      savingsEvents, conversationResponder: { respond: responder }
    });

    const answer = await agent.respond({ ...request,
      message: "Which purchase did I mention at North Star Cafe in this conversation?" });

    expect(answer.message).toContain("more than one matching moment");
    expect(answer.message).toContain("Which merchant or detail");
    expect(answer.decision.action).toBe("reflect");
    expect(responder).not.toHaveBeenCalled();
    expect(await savingsEvents.list(request.userId, request.conversationId)).toHaveLength(2);
    expect(await agent.respond({ ...request, message: "Yes" })).toMatchObject({
      decision: { action: "ask_follow_up" }
    });
    expect(await agent.respond({ ...request,
      message: "What purchase did I mention about the concert tickets in this conversation?" })).toMatchObject({
      message: expect.stringContaining("couldn't match that description")
    });
  });

  it("passes only the exact user's events from the exact conversation into history snapshots", async () => {
    const savingsEvents = new InMemoryConversationSavingsEventStore();
    const tools = new MockVictoriaTools();
    const received: ConversationResponderInput[] = [];
    const responder = vi.fn(async (input: ConversationResponderInput) => {
      received.push(input);
      return "You mentioned waiting on a book purchase.";
    });
    const request = { userId: "scoped_history_user", conversationId: "scoped_history_chat" };
    const ownEvent: SavingsEvent = {
      id: "scoped-own", userId: request.userId, type: "avoided_spend",
      summary: "I waited before buying a book.", merchantName: "Paper House",
      userProvidedAmountCents: 1_200, classificationConfidence: 0.96,
      createdAt: "2026-10-20T12:00:00.000Z"
    };
    const otherConversationEvent: SavingsEvent = {
      ...ownEvent, id: "scoped-other-chat", summary: "I waited before buying a camera.", merchantName: "Camera Shop",
      createdAt: "2026-10-19T12:00:00.000Z"
    };
    const otherUserEvent: SavingsEvent = {
      ...ownEvent, id: "scoped-other-user", userId: "another_user",
      summary: "I waited before buying headphones.", merchantName: "Sound Shop",
      createdAt: "2026-10-18T12:00:00.000Z"
    };
    await savingsEvents.record({ conversationId: request.conversationId, event: ownEvent });
    await savingsEvents.record({ conversationId: "another_conversation", event: otherConversationEvent });
    await savingsEvents.record({ conversationId: request.conversationId, event: otherUserEvent });
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      savingsEvents, conversationResponder: { respond: responder }
    });

    const answer = await agent.respond({ ...request,
      message: "Which event did I mention first in this conversation?" });

    expect(answer.decision.action).toBe("reflect");
    expect(responder).toHaveBeenCalledOnce();
    expect(received[0]?.conversationSavingsEvents).toMatchObject([{
      eventId: ownEvent.id, summary: ownEvent.summary, userProvidedAmountCents: 1_200
    }]);
    expect(received[0]?.contextSnapshot?.conversationSavingsEvents).toEqual(received[0]?.conversationSavingsEvents);
    expect(received[0]?.financialContext?.conversationSavingsEvents).toEqual(received[0]?.conversationSavingsEvents);
    expect(JSON.stringify(received[0]?.contextSnapshot)).not.toContain("Camera Shop");
    expect(JSON.stringify(received[0]?.contextSnapshot)).not.toContain("Sound Shop");
  });

  it("[APR-004] does not route a mixed approval or revision question around pending-action gates", async () => {
    const tools = new MockVictoriaTools();
    let mixedInput: ConversationResponderInput | undefined;
    const conversationResponder = { respond: vi.fn(async (input: ConversationResponderInput) => {
      mixedInput = input;
      return "Read-only answer.";
    }) };
    const base = createMockAgentTeamSpecialists();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools, conversationResponder,
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "avoided_spend", confidence: 0.9, amountCents: 3_500, summary: message, needsClarification: false
      } }) } }
    });
    const request = { userId: "pending_mixed_question_user", conversationId: "pending_mixed_question_chat" };
    await agent.respond({ ...request, message: "I waited on a $35 purchase." });
    const mixed = await agent.respond({ ...request, message: "Should I record it, and which event did I mention?" });

    expect(mixed.decision.action).toBe("reflect");
    expect(conversationResponder.respond).toHaveBeenCalledOnce();
    expect(mixedInput?.conversationSavingsEvents).toBeUndefined();
    expect(mixedInput?.financialContext?.conversationSavingsEvents).toEqual([]);
    expect(mixedInput?.contextSnapshot?.conversationSavingsEvents).toBeUndefined();
    expect(mixedInput?.contextSnapshot?.financialContext?.historicalEventReference).toBeUndefined();
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
    const approved = await agent.respond({ ...request, message: "Yes" });
    expect(approved.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(request.userId)).toHaveLength(1);
  });

  it("withholds event history from a mixed action/history question when no proposal is pending", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const mixedQuestion = "What purchase did I mention, and should I record it?";
    let mixedInput: ConversationResponderInput | undefined;
    const responder = vi.fn(async (input: ConversationResponderInput) => {
      mixedInput = input;
      return "I can discuss the choice, but I need a clear separate request before any recording action.";
    });
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { async analyze(input) {
        if (input.message === mixedQuestion) return { classification: {
          type: "general_finance", confidence: 0.95, summary: mixedQuestion, needsClarification: false
        } };
        return { classification: {
          type: "avoided_spend", confidence: 0.95, amountCents: 2_000,
          summary: input.message, needsClarification: false
        } };
      } } }
    });
    const request = { userId: "nonpending_mixed_history_user", conversationId: "nonpending_mixed_history_chat" };
    await agent.respond({ ...request, message: "I almost bought a $20 book but decided to wait." });
    await agent.respond({ ...request, message: "No" });

    const answer = await agent.respond({ ...request, message: mixedQuestion });

    expect(answer.decision.action).toBe("reflect");
    expect(responder).toHaveBeenCalledOnce();
    expect(mixedInput?.conversationSavingsEvents).toBeUndefined();
    expect(mixedInput?.financialContext?.conversationSavingsEvents).toEqual([]);
    expect(mixedInput?.contextSnapshot?.conversationSavingsEvents).toBeUndefined();
    expect(mixedInput?.contextSnapshot?.financialContext?.historicalEventReference).toBeUndefined();
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("keeps a mixed advice-and-record request on the confirmation-gated savings route", async () => {
    const tools = new MockVictoriaTools();
    const responder = vi.fn(async () => "Read-only answer that must not replace action handling.");
    const base = createMockAgentTeamSpecialists();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "avoided_spend", confidence: 0.95, amountCents: 2_000,
        summary: message, needsClarification: false
      } }) } }
    });
    const request = { userId: "mixed_advice_record_user", conversationId: "mixed_advice_record_chat" };

    const suggestion = await agent.respond({ ...request,
      message: "I skipped a $20 book. Can you talk through whether I should record it?" });

    expect(suggestion.decision.action).toBe("suggest_savings");
    expect(suggestion.decision.proposal?.status).toBe("pending");
    expect(responder).not.toHaveBeenCalled();
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
    const approved = await agent.respond({ ...request, message: "Yes" });
    expect(approved.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(request.userId)).toHaveLength(1);
  });

  it("[APR-004] answers later recurring-cost math after a declined proposal without reopening it", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const request = { userId: "declined_projection_user", conversationId: "declined_projection_chat" };
    await agent.respond({ ...request, message: "I canceled a class that cost me $35 each month." });
    await agent.respond({ ...request, message: "No." });
    const response = await agent.respond({ ...request, message: "How much would that be in a year if I kept it aside?" });
    expect(response.decision.action).toBe("reflect");
    expect(response.message).toContain("$420.00");
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("[IDM-001] does not reopen a completed entry for a repeated approval turn", async () => {
    const tools = new MockVictoriaTools();
    const memory = new MockMemoryProvider();
    const createFreshAgent = () => new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });
    const agent = createFreshAgent();
    const request = { userId: "repeat_approval_user", conversationId: "repeat_approval_chat" };
    await agent.respond({ ...request, message: "I made coffee at home instead of buying a $6 latte." });
    const approval = "Yes, record the $6 latte I skipped in the mocked savings ledger.";
    const recorded = await agent.respond({ ...request, message: approval });
    expect(recorded.decision.action).toBe("create_ledger_entry");
    const repeat = await createFreshAgent().respond({ ...request, message: approval });
    expect(repeat.decision.action).toBe("ask_follow_up");
    expect(repeat.message).toMatch(/repeat of your last approval/i);
    expect(repeat.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries(request.userId)).toHaveLength(1);
  });

  it("[INT-005] uses an ended recurring activity cost for planning even when the provider calls it unclear", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      specialists: {
        ...base,
        financialMoment: { analyze: async () => ({ classification: {
          type: "unclear", confidence: 0.8, summary: "Budgeting question", needsClarification: true
        } }) },
        companionVoice: { respond: async () =>
          "Quitting baseball sounds sensible if it was hurting your knees. That former $350.00 monthly cost could become a $4,200.00 annual planning target if it stays out of your budget. Which planning target would you prefer, monthly or annual?" }
      }
    });
    const request = { userId: "ended_baseball_user", conversationId: "baseball_chat" };
    const first = await agent.respond({ ...request, message:
      "hey i just chose to ditch playing baseball. It was costing me like $350 a month just to play and my knees hurt because of it. would this be a good idea to park this money somewhere?" });
    expect(first.decision.classification.type).toBe("avoided_spend");
    expect(first.decision.suggestion?.amountCents).toBe(35000);
    expect(first.message).toContain("$350.00");
    expect(first.message).toContain("$4,200.00");
    expect(first.message).toMatch(/monthly or annual/i);
    expect(first.message).not.toMatch(/What did you avoid spending on/i);
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
    const choice = await agent.respond({ ...request, message: "annual" });
    expect(choice.message).toContain("this month's $350.00");
    expect(choice.message).toContain("$4,200.00");
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
    const confirmed = await agent.respond({ ...request, message: "yes" });
    expect(confirmed.decision.action).toBe("create_ledger_entry");
    expect((await tools.listSavingsEntries(request.userId))[0]?.amountCents).toBe(35000);
  });

  it("does not treat a possible future cancellation as an avoided recurring cost", async () => {
    const response = await createAgent([], new MockVictoriaTools()).respond({
      userId: "possible_cancel_user",
      message: "I might quit baseball; it costs me $350 a month. Should I park that money somewhere?"
    });
    expect(response.decision.action).not.toBe("suggest_savings");
  });

  it("refuses a real transfer even when an ended recurring cost is stated", async () => {
    const tools = new MockVictoriaTools();
    const response = await createAgent([], tools).respond({
      userId: "ended_transfer_user",
      message: "I quit baseball; it cost me $350 a month. Please transfer $350 from checking to savings."
    });
    expect(response.decision.action).toBe("refuse");
    expect(await tools.listSavingsEntries("ended_transfer_user")).toEqual([]);
  });

  it("treats a covered-expense money-redirection question as planning advice", async () => {
    const response = await createAgent([], new MockVictoriaTools()).respond({
      userId: "covered_budgeting_question_user",
      message: "I like to play basketball at this gym that costs me $35 a month, but now my company pays for my gym membership. Is it a good idea to move this money elsewhere?"
    });
    expect(response.decision.classification.type).toBe("avoided_spend");
    expect(response.decision.action).toBe("suggest_savings");
    expect(response.decision.toolCall?.name).toBe("createSavingsEntry");
  });

  it.each([
    "My company now covers my $35 monthly gym bill. Please transfer $35 from checking to savings.",
    "My company now covers my $35 monthly gym bill. Please transfer it.",
    "My company now covers my $35 monthly gym bill. Move the money from checking into savings."
  ])("refuses a real transfer command even when the employer covers the recurring bill: %s", async (message) => {
    const tools = new MockVictoriaTools();
    const response = await createAgent([], tools).respond({
      userId: "covered_transfer_user",
      message
    });
    expect(response.decision.classification.type).toBe("real_money_movement_request");
    expect(response.decision.action).toBe("refuse");
    expect(await tools.listSavingsEntries("covered_transfer_user")).toEqual([]);
  });

  it("keeps the planning state grounded when Companion Voice omits the target choice", async () => {
    const base = createMockAgentTeamSpecialists();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools: new MockVictoriaTools(),
      specialists: { ...base, companionVoice: { respond: async () => "The gym is covered. What do you think?" } }
    });
    const request = { userId: "planning_voice_fallback_user", conversationId: "planning_voice_fallback_chat" };
    const first = await agent.respond({ ...request, message: "My employer now covers my $35 monthly gym membership." });
    expect(first.message).toMatch(/monthly or annual/i);
    expect(first.decision.planningChoice).toMatchObject({ monthlyAmountCents: 3500, annualProjectionCents: 42000 });
    const annual = await agent.respond({ ...request, message: "annual" });
    expect(annual.message).toContain("Say yes to confirm");
    expect(annual.message).not.toMatch(/Which planning target/i);
  });

  it.each(["annual", "I'd rather use the yearly one", "use the annual $420", "monthly"]) (
    "continues a covered-expense planning choice without replaying the question: %s",
    async (answer) => {
      const tools = new MockVictoriaTools();
      const base = createMockAgentTeamSpecialists();
      const classify = vi.fn(base.financialMoment.analyze);
      const voice = vi.fn(async () =>
        "With work covering the gym, you have $35 each month, or $420 over a year if coverage continues. Which planning target would you prefer, monthly or annual?");
      const agent = new VictoriaAgent({
        llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
        specialists: { ...base, financialMoment: { analyze: classify }, companionVoice: { respond: voice } }
      });
      const request = { userId: "planning_user", conversationId: "planning_chat" };
      await agent.respond({ ...request, message: "My employer now covers my $35 monthly gym membership." });
      const callsAfterFirstTurn = classify.mock.calls.length;
      const answerResponse = await agent.respond({ ...request, message: answer });

      expect(classify).toHaveBeenCalledTimes(callsAfterFirstTurn);
      expect(voice).toHaveBeenCalledTimes(1);
      expect(answerResponse.message).toMatch(/Say yes to confirm/);
      expect(answerResponse.message).not.toMatch(/which planning target/i);
      expect(answerResponse.message).toContain("$35.00");
      expect(answerResponse.message).toContain("No real money moves");
      if (/annual|yearly/i.test(answer)) expect(answerResponse.message).toContain("$420.00");
      expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
      const confirmation = await agent.respond({ ...request, message: "yes" });
      expect(confirmation.decision.action).toBe("create_ledger_entry");
      expect((await tools.listSavingsEntries(request.userId))[0]?.amountCents).toBe(3500);
    }
  );

  it("does not treat yes to a planning-target question as ledger approval", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      specialists: {
        ...base,
        companionVoice: { respond: async () =>
          "You have $35 monthly or $420 annually if coverage continues. Which allocation target would you prefer?" }
      }
    });
    const request = { userId: "approval_guard_user", conversationId: "planning_chat" };
    await agent.respond({ ...request, message: "My employer covers my $35 monthly gym membership now." });
    const response = await agent.respond({ ...request, message: "yes" });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.message).toMatch(/monthly or annual/i);
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("recovers a chosen horizon from conversation after restoring an immutable pending proposal", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    let stored: Awaited<ReturnType<PendingSavingsActionStore["getPending"]>> = null;
    const pendingSavingsActions: PendingSavingsActionStore = {
      async getPending() { return stored; },
      async commit({ pendingAction, responseDecision }) {
        if (!stored && pendingAction) stored = pendingAction;
        if (responseDecision.proposalTransitions?.some((transition) => transition.to === "recorded")) stored = null;
      }
    };
    const createAgent = () => new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools, pendingSavingsActions,
      specialists: { ...base, companionVoice: { respond: async () =>
        "The gym is covered at $35 monthly or $420 annually if coverage continues. Which planning target do you prefer?" } }
    });
    const request = { userId: "restored_choice_user", conversationId: "restored_choice_chat" };
    await createAgent().respond({ ...request, message: "I like basketball at a gym that costs $35 a month, but my company now covers it." });
    const chosen = await createAgent().respond({ ...request, message: "yearly" });
    expect(chosen.message).toContain("Say yes to confirm");
    const ambiguous = await createAgent().respond({ ...request, message: "sure I guess" });
    expect(ambiguous.decision.action).toBe("ask_follow_up");
    const approved = await createAgent().respond({ ...request, message: "yes" });
    expect(approved.decision.action).toBe("create_ledger_entry");
    expect((await tools.listSavingsEntries(request.userId))[0]?.amountCents).toBe(3500);
  });

  it("keeps the annual target clear and asks for one approval of this month's amount", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    let stored: Awaited<ReturnType<PendingSavingsActionStore["getPending"]>> = null;
    const pendingSavingsActions: PendingSavingsActionStore = {
      async getPending() { return stored; },
      async commit({ pendingAction, responseDecision }) {
        if (!stored && pendingAction) stored = pendingAction;
        if (responseDecision.proposalTransitions?.some((transition) => transition.to === "declined" || transition.to === "recorded")) stored = null;
      }
    };
    const createAgent = () => new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools, pendingSavingsActions,
      specialists: { ...base, companionVoice: { respond: async () =>
        "Your promotion keeps basketball in your week and frees $35 monthly, or $420 over a year if coverage continues. Which planning target do you prefer?" } }
    });
    const request = { userId: "annual_insistence_user", conversationId: "annual_insistence_chat" };
    await createAgent().respond({ ...request, message: "I play basketball at a $35/month gym, but my promotion means work now pays for it." });
    await createAgent().respond({ ...request, message: "What about yearly, how much would that be?" });
    const chosen = await createAgent().respond({ ...request, message: "I want to allocate how much it would be yearly" });
    expect(chosen.decision.planningChoice?.selectedHorizon).toBe("annual");
    expect(chosen.message).toContain("$420.00 is the yearly target");
    expect(chosen.message).toContain("Say yes to confirm");
    const repeated = await createAgent().respond({ ...request, message: "I want the yearly amount" });
    expect(repeated.message).toContain("$420.00");
    expect(repeated.message).toContain("Say yes to record it");
    expect(repeated.decision.proposal?.status).toBe("pending");
    const yearlyRecordRequest = await createAgent().respond({ ...request, message: "bruh record the yearly amount" });
    expect(yearlyRecordRequest.message).toContain("$420.00 a year");
    expect(yearlyRecordRequest.message).toContain("$35.00 toward that target");
    expect(yearlyRecordRequest.message).toContain("Say yes to record it");
    expect(yearlyRecordRequest.decision.action).toBe("ask_follow_up");
    expect(yearlyRecordRequest.decision.proposal?.suggestion.amountCents).toBe(3500);
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
    const clarified = await createAgent().respond({ ...request, message: "future target" });
    expect(clarified.message).toContain("$420.00 is a future yearly target");
    expect(clarified.message).toContain("Say yes to confirm");
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
    const changedToMonthly = await createAgent().respond({ ...request, message: "actually, use monthly" });
    expect(changedToMonthly.decision.planningChoice?.selectedHorizon).toBe("monthly");
    expect(changedToMonthly.message).toContain("$35.00 is the monthly target");
    expect(changedToMonthly.message).toContain("$35.00 in your Victoria savings ledger");
    expect(changedToMonthly.decision.proposal?.suggestion.amountCents).toBe(3500);
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
    const yes = await createAgent().respond({ ...request, message: "yes" });
    expect(yes.decision.action).toBe("create_ledger_entry");
    expect((await tools.listSavingsEntries(request.userId))[0]?.amountCents).toBe(3500);
  });

  it("uses a validated annual fact reference to explain a pending projection request without revising or recording it", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const request = { userId: "annual_fact_reference_user", conversationId: "annual_fact_reference_chat" };
    const referenceRequest = "Please record the longer projection in the savings ledger.";
    const analyze = vi.fn(async (input) => input.message === referenceRequest
      ? { classification: {
          type: "proposal_revision" as const,
          confidence: 0.95,
          summary: "The user asks to record the annual projection.",
          needsClarification: false,
          referenceHint: { factId: "turn:0:annual-projection", period: "annual" as const }
        } }
      : base.financialMoment.analyze(input));
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools,
      specialists: { ...base, financialMoment: { analyze } }
    });

    const initial = await agent.respond({
      ...request,
      message: "I play basketball at a $35/month gym, but my employer now covers it."
    });
    const selected = await agent.respond({ ...request, message: "annual" });
    const response = await agent.respond({ ...request, message: referenceRequest });

    expect(selected.decision.planningChoice?.selectedHorizon).toBe("annual");
    expect(response.message).toContain("$420.00 annual projection");
    expect(response.message).toContain("pending entry is still this month's $35.00");
    expect(response.message).toContain("say yes only if you'd like me to record that");
    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.proposal?.id).toBe(initial.decision.proposal?.id);
    expect(response.decision.proposal?.suggestion.amountCents).toBe(3500);
    expect(response.decision.planningChoice?.selectedHorizon).toBe("annual");
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);

    const twelveMonthReference = await agent.respond({ ...request, message: "Please record the 12-month projection." });
    expect(twelveMonthReference.message).toContain("$420.00");
    expect(twelveMonthReference.decision.proposal?.id).toBe(initial.decision.proposal?.id);
    expect(twelveMonthReference.decision.proposal?.suggestion.amountCents).toBe(3500);
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("resolves an explicit active-event reference after an unrelated intervening turn", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const message = "What should I do about that jacket purchase?";
    let receivedContext: Parameters<AgentTeamSpecialists["financialMoment"]["analyze"]>[0]["financialContext"];
    let receivedSnapshot: Parameters<AgentTeamSpecialists["financialMoment"]["analyze"]>[0]["contextSnapshot"];
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools,
      specialists: {
        ...base,
        financialMoment: {
          async analyze(input) {
            if (input.message === message) {
              receivedContext = input.financialContext;
              receivedSnapshot = input.contextSnapshot;
            }
            return base.financialMoment.analyze(input);
          }
        }
      }
    });
    const request = { userId: "active_event_reference_user", conversationId: "active_event_reference_chat" };
    const initial = await agent.respond({ ...request, message: "I almost bought a $20 jacket but decided to wait." });
    await agent.respond({ ...request, message: "I took a nice walk after lunch." });
    const response = await agent.respond({ ...request, message });

    expect(receivedContext?.workflowState?.status === "awaiting_confirmation" && receivedContext.workflowState.currentMessageReference).toEqual({
      eventId: initial.decision.savingsEvent?.id,
      matchedBy: "source_summary"
    });
    expect(receivedSnapshot?.currentMessage).toBe(message);
    expect(receivedSnapshot?.dialogueTurns.some(({ role, content }) =>
      role === "user" && content === "I almost bought a $20 jacket but decided to wait."
    )).toBe(true);
    expect(Object.isFrozen(receivedSnapshot)).toBe(true);
    expect(receivedSnapshot).toBeDefined();
    expect(response.decision.proposal?.id).toBe(initial.decision.proposal?.id);
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("declines a pending entry and continues with the user's separate question", async () => {
    const tools = new MockVictoriaTools();
    const memory = new MockMemoryProvider();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });
    const request = { userId: "decline_question_user", conversationId: "decline_question_chat" };
    await agent.respond({ ...request, message: "I almost bought a $35 jacket but decided to wait." });

    const response = await agent.respond({
      ...request,
      message: "No, don't record it. What should I think about instead?"
    });

    expect(["reflect", "ask_follow_up"]).toContain(response.decision.action);
    expect(response.decision.proposal?.status).toBe("declined");
    expect(response.decision.proposalTransitions?.at(-1)?.to).toBe("declined");
    expect(response.message).toMatch(/^No problem\. I won't record it\. /);
    expect(response.message.length).toBeGreaterThan("No problem. I won't record it.".length);
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("answers a separate question after declining without reopening the ledger proposal", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      specialists: { ...base, companionVoice: { respond: async () =>
        "The gym is covered at $35 monthly or $420 yearly if coverage continues. Which planning target do you prefer, monthly or annual?" } },
      personalizedReplyPersonalizer: {
        async personalize(input) {
          return {
            message: "You could keep the $35 monthly as breathing room or set it aside for a priority that matters to you. Which feels more useful right now?",
            usedMemoryIds: input.memories.slice(0, 1).map((item) => item.id)
          };
        }
      }
    });
    const request = { userId: "decline_advice_user", conversationId: "decline_advice_chat" };
    await agent.respond({ ...request, message: "I like basketball, and work now covers my $35 monthly gym membership." });
    await agent.respond({ ...request, message: "annual" });
    const response = await agent.respond({
      ...request, message: "No, don't record it. What would you recommend I do with the money instead?"
    });

    expect(response.message).toContain("No problem. I won't record it.");
    expect(response.message).toContain("You could keep the $35 monthly as breathing room");
    expect(response.decision.proposal?.status).toBe("declined");
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("treats an employer-covered monthly bill as a savings suggestion and distinguishes its annual projection", async () => {
    const tools = new MockVictoriaTools();
    const memory = new MockMemoryProvider();
    const baseSpecialists = createMockAgentTeamSpecialists();
    const companionVoice = vi.fn(async ({ finding }: Parameters<typeof baseSpecialists.companionVoice.respond>[0]) => {
      const interest = finding.responseContext?.rememberedInterests?.[0];
      const annual = finding.responseContext?.validatedAdditionalAmountsCents?.[0];
      return `I'm glad you shared that you enjoy ${interest}; I'll keep it in mind. That leaves $35.00 each month, or $${((annual ?? 0) / 100).toFixed(2)} over the year if coverage continues. Which planning horizon would you prefer?`;
    });
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools,
      specialists: { ...baseSpecialists, companionVoice: { respond: companionVoice } }
    });
    const response = await agent.respond({
      userId: "user_123",
      conversationId: "employer_covers_gym",
      message: "Hey, I like to play basketball at this gym that costs me $35 a month, but now my company pays for my gym membership. Is it a good idea to move this money elsewhere?"
    });

    expect(response.decision.classification.type).toBe("avoided_spend");
    expect(response.decision.action).toBe("suggest_savings");
    expect(response.decision.suggestion?.amountCents).toBe(3500);
    expect(response.message).toContain("$420.00 over the year if coverage continues");
    expect(response.message).toContain("$35.00");
    expect(response.message).toContain("I'm glad you shared that you enjoy basketball");
    expect(response.message).toMatch(/planning horizon|allocation target/i);
    expect(response.message).not.toMatch(/record .*ledger/i);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
    expect(await memory.listConversationalMemories("user_123")).toEqual(expect.arrayContaining([
      expect.objectContaining({ category: "other", key: "interest:basketball", value: "Enjoys basketball." })
    ]));
    expect(companionVoice).toHaveBeenCalledWith(expect.objectContaining({
      finding: expect.objectContaining({
        responseContext: {
          validatedAdditionalAmountsCents: [42000], validatedAnnualProjectionCents: 42000,
          rememberedInterests: ["basketball"],
          awaitingAllocationTargetChoice: true
        }
      })
    }));
  });

  afterEach(() => vi.useRealTimers());

  it.each([
    "The thing that works best for me is keeping routines small and specific.",
    "Weekends are easier for me when I plan meals ahead."
  ])("classifies natural first-person context as ordinary conversation: %s", async (message) => {
    const memory = await new MockMemoryProvider().getMemoryForUser("classifier_test");
    const classification = await new MockLlmAdapter().classifyMessage({ userMessage: message, memory });
    expect(classification.type).toBe("general_finance");
  });

  it("provides the rolling user and Victoria conversation to later classifications", async () => {
    const contexts: (readonly string[])[] = [];
    const base = new MockLlmAdapter();
    const memory = new MockMemoryProvider();
    const agent = new VictoriaAgent({
      llm: {
        async classifyMessage(input) {
          contexts.push(input.conversationContext ?? []);
          return base.classifyMessage(input);
        },
        draftResponse: (input) => base.draftResponse(input)
      },
      memory,
      tools: new MockVictoriaTools()
    });
    const request = { userId: "user_context", conversationId: "chat_context" };
    await agent.respond({ ...request, message: "I almost bought a $9 book but decided to wait." });
    await agent.respond({ ...request, message: "I made coffee at home instead of going to Blue Bottle." });

    expect(contexts.some((context) => context.includes("I almost bought a $9 book but decided to wait."))).toBe(true);
    expect(contexts.some((context) => context.some((message) => message.startsWith("Victoria: ")))).toBe(true);
  });

  it("keeps generated IDs unique when the injected ID factory repeats a value", async () => {
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools: new MockVictoriaTools(),
      idFactory: () => "same"
    });
    const first = await agent.respond({ userId: "user_ids", conversationId: "chat-a", message: "I almost bought a $9 book but decided to wait." });
    const second = await agent.respond({ userId: "user_ids", conversationId: "chat-b", message: "I almost bought a $12 book but decided to wait." });

    expect(first.decision.proposal?.id).toBeDefined();
    expect(second.decision.proposal?.id).toBeDefined();
    expect(first.decision.proposal?.id).not.toBe(second.decision.proposal?.id);
    expect(first.decision.toolCall?.actionId).not.toBe(second.decision.toolCall?.actionId);
  });

  it("ignores a pending amount clarification returned for another user", async () => {
    const tools = new MockVictoriaTools();
    const store: PendingAmountClarificationStore = {
      async get() {
        return {
          classification: {
            type: "avoided_spend", confidence: 1, summary: "Skipped a purchase.", needsClarification: true
          },
          savingsEvent: {
            id: "other-user-event", userId: "user_other", type: "avoided_spend", summary: "Skipped a purchase.",
            classificationConfidence: 1, createdAt: "2026-10-19T12:00:00.000Z"
          }
        };
      },
      async set() {},
      async clear() {}
    };
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      pendingAmountClarifications: store });

    const response = await agent.respond({ userId: "user_a", conversationId: "amount_scope", message: "$30" });

    expect(response.decision.savingsEvent?.id).not.toBe("other-user-event");
    expect(await tools.listSavingsEntries("user_a")).toEqual([]);
  });

  it("keeps a pending amount clarification inside its owning conversation", async () => {
    const tools = new MockVictoriaTools();
    const clarifications = new Map<string, Awaited<ReturnType<PendingAmountClarificationStore["get"]>>>();
    const key = (userId: string, conversationId: string) => `${userId}:${conversationId}`;
    const pendingAmountClarifications: PendingAmountClarificationStore = {
      async get(userId, conversationId) { return clarifications.get(key(userId, conversationId)) ?? null; },
      async set(userId, conversationId, value) { clarifications.set(key(userId, conversationId), value); },
      async clear(userId, conversationId) { clarifications.delete(key(userId, conversationId)); }
    };
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools, pendingAmountClarifications
    });
    const owner = { userId: "amount_scope_user", conversationId: "amount_owner_chat" };
    const other = { userId: owner.userId, conversationId: "amount_other_chat" };
    const clarification = await agent.respond({ ...owner, message: "I cooked instead of ordering takeout." });
    expect(clarification.decision.action).toBe("ask_follow_up");

    const unrelatedAmount = await agent.respond({ ...other, message: "$30" });
    expect(unrelatedAmount.decision.savingsEvent?.id).not.toBe(clarification.decision.savingsEvent?.id);
    expect(clarifications.has(key(owner.userId, owner.conversationId))).toBe(true);
    expect(clarifications.has(key(other.userId, other.conversationId))).toBe(false);

    const ownerAmount = await agent.respond({ ...owner, message: "$30" });
    expect(ownerAmount.decision.action).toBe("suggest_savings");
    expect(ownerAmount.decision.savingsEvent?.id).toBe(clarification.decision.savingsEvent?.id);
    expect(ownerAmount.decision.suggestion?.amountCents).toBe(3000);
    expect(await tools.listSavingsEntries(owner.userId)).toEqual([]);
  });

  it("[COR-001] returns frozen financial history snapshots that cannot rewrite an approved proposal or entry", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "immutable_history" };
    const proposed = await agent.respond({
      ...context,
      message: "I almost bought a $27 pastry but decided to wait."
    });
    const proposal = proposed.decision.proposal;
    expect(proposal).toBeDefined();
    if (!proposal) throw new Error("Expected a proposal.");
    expect(Object.isFrozen(proposal)).toBe(true);
    expect(Object.isFrozen(proposed.decision.savingsEvent)).toBe(true);
    expect(Object.isFrozen(proposal.suggestion)).toBe(true);
    expect(Reflect.set(proposal.suggestion, "amountCents", 1)).toBe(false);

    const recorded = await agent.respond({ ...context, message: "Yes" });
    const [entry] = await tools.listSavingsEntries("user_123");
    expect(entry).toBeDefined();
    if (!entry) throw new Error("Expected a ledger entry.");
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Reflect.set(entry, "amountCents", 1)).toBe(false);
    expect(recorded.decision.proposal?.status).toBe("recorded");
    if (recorded.decision.proposal?.status === "recorded") {
      expect(Object.isFrozen(recorded.decision.proposal.approval)).toBe(true);
      expect(Reflect.set(recorded.decision.proposal.approval, "userId", "user_other")).toBe(false);
    }
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([{ amountCents: 2700 }]);
  });

  it("answers weekly progress through a read-only ledger summary tool", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T15:00:00.000Z"));
    const tools = new MockVictoriaTools([], [
      savingsEntry({ id: "entry_this_week", userId: "user_123", amountCents: 2750,
        approvedActionId: "action_this_week", createdAt: "2026-10-05T10:00:00.000Z" }),
      savingsEntry({ id: "entry_prior_week", userId: "user_123", amountCents: 9000,
        approvedActionId: "action_prior_week", createdAt: "2026-10-04T23:59:59.999Z" }),
      savingsEntry({ id: "entry_other_user", userId: "user_other", amountCents: 8000,
        approvedActionId: "action_other_user", createdAt: "2026-10-06T10:00:00.000Z" })
    ]);
    const agent = createAgent([], tools);

    const response = await agent.respond({
      userId: "user_123",
      message: "How much have I saved this week?"
    });

    expect(response.decision.action).toBe("summarize_progress");
    expect(response.decision.toolCall).toMatchObject({
      name: "getWeeklySavingsTotal",
      requiresApproval: false
    });
    expect(response.message).toContain("$27.50");
    expect(response.message).toContain("mocked Victoria savings ledger");
    expect(response.message).toContain("No real money has moved");
  });

  it("[COR-003] [COR-005] appends an approved correction and keeps the recorded entry unchanged", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T12:00:00.000Z"));
    const tools = new MockVictoriaTools([], [savingsEntry({
      id: "entry_original", userId: "user_123", amountCents: 2700,
      createdAt: "2026-09-30T12:00:00.000Z"
    })]);
    const corrected = await tools.createSavingsEntryCorrection({
      userId: "user_123", savingsEntryId: "entry_original", correctedAmountCents: 2400,
      reason: "The original estimate was too high.", approvalId: "approval_correction_1",
      approvedActionId: "correction_action_1"
    });
    expect(corrected).toMatchObject({
      savingsEntryId: "entry_original", correctedAmountCents: 2400, adjustmentCents: -300
    });
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([{ id: "entry_original", amountCents: 2700 }]);
    expect(await tools.listSavingsEntryCorrections("user_123")).toEqual([corrected]);
    expect(await tools.createSavingsEntryCorrection({
      userId: "user_123", savingsEntryId: "entry_original", correctedAmountCents: 2400,
      reason: "The original estimate was too high.", approvalId: "approval_correction_1", approvedActionId: "correction_action_1"
    })).toEqual(corrected);
    expect(await tools.getWeeklySavingsTotal("user_123", new Date("2026-10-01T12:00:00.000Z"))).toBe(2400);
    expect(await tools.getWeeklySavingsTotal("user_123", new Date("2026-10-06T12:00:00.000Z"))).toBe(0);
  });

  it("rejects no-op corrections, invalid amounts, and corrections to another user's entry", async () => {
    const tools = new MockVictoriaTools([], [savingsEntry({
      id: "entry_original", userId: "user_123", amountCents: 2700, createdAt: new Date().toISOString()
    })]);
    const correction = {
      userId: "user_123", savingsEntryId: "entry_original", correctedAmountCents: 2400,
      reason: "Correction", approvalId: "approval_1", approvedActionId: "action_1"
    };
    await expect(tools.createSavingsEntryCorrection({ ...correction, correctedAmountCents: 0 })).rejects.toThrow("positive safe integer");
    await expect(tools.createSavingsEntryCorrection({ ...correction, correctedAmountCents: Number.MAX_SAFE_INTEGER + 1 })).rejects.toThrow("positive safe integer");
    await expect(tools.createSavingsEntryCorrection({ ...correction, userId: "user_other" })).rejects.toThrow("owned by the user");
    await tools.createSavingsEntryCorrection(correction);
    await expect(tools.createSavingsEntryCorrection({ ...correction, approvedActionId: "action_2" })).rejects.toThrow("non-zero");
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([{ amountCents: 2700 }]);
    expect(await tools.listSavingsEntryCorrections("user_123")).toHaveLength(1);
  });

  it("does not record an ambiguous or declined correction", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "declined_correction" };
    await agent.respond({ ...context, message: "I almost bought a $27 pastry but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    await agent.respond({ ...context, message: "Correct that recorded entry to $24." });
    const ambiguous = await agent.respond({ ...context, message: "Maybe" });
    expect(ambiguous.decision.action).toBe("ask_follow_up");
    expect(await tools.listSavingsEntryCorrections("user_123")).toEqual([]);
    const declined = await agent.respond({ ...context, message: "No" });
    expect(declined.decision.action).toBe("reflect");
    expect(await tools.listSavingsEntryCorrections("user_123")).toEqual([]);
    expect((await tools.listSavingsEntries("user_123"))[0]?.amountCents).toBe(2700);
  });

  it("[COR-003] [COR-004] requires exact approval before correcting a just-recorded entry in the conversation", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "entry_correction" };
    await agent.respond({ ...context, message: "I almost bought a $27 pastry but decided to wait." });
    const recorded = await agent.respond({ ...context, message: "Yes" });
    const original = (await tools.listSavingsEntries("user_123"))[0];
    expect(recorded.decision.action).toBe("create_ledger_entry");
    const correctionProposal = await agent.respond({ ...context, message: "Correct that recorded entry to $24." });
    expect(correctionProposal.decision.action).toBe("correct_ledger_entry");
    expect(correctionProposal.decision.toolCall?.requiresApproval).toBe(true);
    expect(correctionProposal.message).toContain("most recently recorded entry in this conversation is currently $27.00");
    expect(correctionProposal.message).toContain("original entry will stay in the history");
    expect(await tools.listSavingsEntryCorrections("user_123")).toEqual([]);
    const unboundApproval = await agent.approveToolCall({ ...context, message: "Yes" }, correctionProposal.decision);
    expect(unboundApproval.decision.action).toBe("refuse");
    expect(await tools.listSavingsEntryCorrections("user_123")).toEqual([]);
    const corrected = await agent.respond({ ...context, message: "Yes" });
    expect(corrected.decision.action).toBe("correct_ledger_entry");
    expect(corrected.message).toContain("corrected the recorded amount to $24.00");
    expect(await tools.listSavingsEntries("user_123")).toEqual([original]);
    expect(await tools.listSavingsEntryCorrections("user_123")).toMatchObject([
      { savingsEntryId: original?.id, correctedAmountCents: 2400, adjustmentCents: -300 }
    ]);
    expect(await tools.getWeeklySavingsTotal("user_123")).toBe(2400);
  });

  it("keeps a pending entry correction labeled during a separate conversational topic", async () => {
    const tools = new MockVictoriaTools();
    const memory = new MockMemoryProvider();
    const responder = vi.fn(async (input: ConversationResponderInput) => {
      expect(input.pendingAction).toBe("entry_correction");
      return "For dinner, a simple grain bowl could be easy to adapt.";
    });
    const extractor = { extract: vi.fn(async () => [{
      category: "other" as const, key: "interest:cooking", value: "Enjoys cooking.", evidence: "I love cooking.",
      confidence: 0.95, subject: "user" as const, assertion: "affirmed" as const,
      stability: "stable" as const, sensitivity: "ordinary" as const
    }]) };
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools,
      conversationResponder: { respond: responder }, conversationalMemoryExtractor: extractor
    });
    const context = { userId: "correction_topic_user", conversationId: "correction_topic_chat" };
    await agent.respond({ ...context, message: "I almost bought a $27 pastry but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    const correction = await agent.respond({ ...context, message: "Correct that recorded entry to $24." });

    const topic = await agent.respond({ ...context, message: "I love cooking. Can you suggest a simple dinner for tonight?" });

    expect(topic.message).toContain("grain bowl");
    expect(responder.mock.calls[0]?.[0].contextSnapshot?.pendingAction).toBe("entry_correction");
    expect(responder.mock.calls[0]?.[0].contextSnapshot?.selectedMemories).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "interest:cooking" })])
    );
    expect(responder.mock.calls[0]?.[0].financialContext?.conversationSavingsEvents).toEqual([]);
    expect(await tools.listSavingsEntryCorrections(context.userId)).toEqual([]);
    const approved = await agent.respond({ ...context, message: "Yes" });
    expect(approved.decision.entryCorrection?.correctedAmountCents).toBe(2_400);
    expect(correction.decision.action).toBe("correct_ledger_entry");
  });

  it("supersedes a pending correction when the user requests a replacement", async () => {
    const tools = new MockVictoriaTools();
    const responder = vi.fn(async () => "I can help with that topic.");
    let persistedCorrection: PersistedPendingEntryCorrection | undefined;
    const correctionTransitions: string[] = [];
    const pendingEntryCorrections: PendingEntryCorrectionStore = {
      async getPending() { return persistedCorrection ?? null; },
      async commit({ pendingAction, terminalAction }) {
        if (pendingAction) persistedCorrection = pendingAction;
        if (terminalAction) {
          correctionTransitions.push(terminalAction.status);
          persistedCorrection = undefined;
        }
      }
    };
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder }, pendingEntryCorrections
    });
    const context = { userId: "correction_revision_user", conversationId: "correction_revision_chat" };
    await agent.respond({ ...context, message: "I almost bought a $27 pastry but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    const proposal = await agent.respond({ ...context, message: "Correct that recorded entry to $24." });

    const revisionRequest = await agent.respond({ ...context, message: "Can you correct that entry to $25 instead?" });

    expect(responder).not.toHaveBeenCalled();
    expect(revisionRequest.decision.action).toBe("ask_follow_up");
    expect(revisionRequest.message).toContain("canceled the pending $24.00 correction");
    expect(correctionTransitions).toContain("superseded");
    expect(persistedCorrection).toBeUndefined();
    expect(await tools.listSavingsEntryCorrections(context.userId)).toEqual([]);
    await agent.respond({ ...context, message: "Yes" });
    expect(await tools.listSavingsEntryCorrections(context.userId)).toEqual([]);
    const replacement = await agent.respond({ ...context, message: "Correct that recorded entry to $25." });
    expect(replacement.decision.entryCorrection?.correctedAmountCents).toBe(2500);
    const approved = await agent.respond({ ...context, message: "Yes" });
    expect(approved.decision.entryCorrection?.correctedAmountCents).toBe(2500);
    expect(proposal.decision.action).toBe("correct_ledger_entry");
  });

  it("supersedes a pending goal allocation when the user requests a new target", async () => {
    const tools = new MockVictoriaTools();
    const responder = vi.fn(async () => "I can help with that topic.");
    let persistedAllocation: PersistedPendingGoalAllocationAction | undefined;
    const allocationTransitions: string[] = [];
    const pendingGoalAllocationActions: PendingGoalAllocationActionStore = {
      async getPending() { return persistedAllocation ?? null; },
      async commit({ pendingAction, terminalAction }) {
        if (pendingAction) persistedAllocation = pendingAction;
        if (terminalAction) {
          allocationTransitions.push(terminalAction.status);
          persistedAllocation = undefined;
        }
      }
    };
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder }, pendingGoalAllocationActions
    });
    const context = { userId: "goal_target_user", conversationId: "goal_target_chat" };
    await agent.respond({ ...context, message: "I almost bought a $27 pastry but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    const proposal = await agent.respond({ ...context, message: "Put that toward my emergency fund." });

    const targetRequest = await agent.respond({ ...context, message: "Can you link this to my travel goal instead?" });

    expect(responder).not.toHaveBeenCalled();
    expect(targetRequest.decision.action).toBe("ask_follow_up");
    expect(targetRequest.message).toContain("canceled the pending Emergency fund allocation");
    expect(allocationTransitions).toContain("superseded");
    expect(persistedAllocation).toBeUndefined();
    expect(await tools.listSavingsGoalAllocations(context.userId)).toEqual([]);
    await agent.respond({ ...context, message: "Yes" });
    expect(await tools.listSavingsGoalAllocations(context.userId)).toEqual([]);
    const replacement = await agent.respond({ ...context, message: "Put that toward my travel goal." });
    expect(replacement.decision.goalAllocation).toMatchObject({ status: "pending", goalName: "Travel" });
    const approved = await agent.respond({ ...context, message: "Yes" });
    expect(approved.decision.goalAllocation).toMatchObject({ status: "recorded", goalName: "Travel" });
    expect(proposal.decision.goalAllocation?.status).toBe("pending");
  });

  it("keeps a pending goal allocation labeled during a separate conversational topic", async () => {
    const tools = new MockVictoriaTools();
    const memory = new MockMemoryProvider();
    const responder = vi.fn(async (input: ConversationResponderInput) => {
      expect(input.pendingAction).toBe("goal_allocation");
      return "For dinner, a simple grain bowl could be easy to adapt.";
    });
    const extractor = { extract: vi.fn(async () => [{
      category: "other" as const, key: "interest:cooking", value: "Enjoys cooking.", evidence: "I love cooking.",
      confidence: 0.95, subject: "user" as const, assertion: "affirmed" as const,
      stability: "stable" as const, sensitivity: "ordinary" as const
    }]) };
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools,
      conversationResponder: { respond: responder }, conversationalMemoryExtractor: extractor
    });
    const context = { userId: "goal_topic_user", conversationId: "goal_topic_chat" };
    await agent.respond({ ...context, message: "I almost bought a $27 pastry but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    const goalProposal = await agent.respond({ ...context, message: "Put that toward my emergency fund." });

    const topic = await agent.respond({ ...context, message: "I love cooking. Can you suggest a simple dinner for tonight?" });

    expect(topic.message).toContain("grain bowl");
    expect(responder.mock.calls[0]?.[0].contextSnapshot?.pendingAction).toBe("goal_allocation");
    expect(responder.mock.calls[0]?.[0].contextSnapshot?.selectedMemories).toEqual(
      expect.arrayContaining([expect.objectContaining({ key: "interest:cooking" })])
    );
    expect(responder.mock.calls[0]?.[0].financialContext?.conversationSavingsEvents).toEqual([]);
    expect(await tools.listSavingsGoalAllocations(context.userId)).toEqual([]);
    const approved = await agent.respond({ ...context, message: "Yes" });
    expect(approved.decision.goalAllocation?.status).toBe("recorded");
    expect(goalProposal.decision.goalAllocation?.status).toBe("pending");
  });

  it("[COR-005] allocates a corrected entry using its current effective amount", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "correct_then_allocate" };
    await agent.respond({ ...context, message: "I almost bought a $27 pastry but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    await agent.respond({ ...context, message: "Correct that recorded entry to $24." });
    const correction = await agent.respond({ ...context, message: "Yes" });
    expect(correction.decision.entryCorrection?.correctedAmountCents).toBe(2400);

    const proposal = await agent.respond({ ...context, message: "Put that toward my emergency fund." });
    expect(proposal.decision.goalAllocation).toMatchObject({
      status: "pending",
      amountCents: 2400,
      goalName: "Emergency fund"
    });
    expect(proposal.message).toContain("$24.00");

    const recorded = await agent.respond({ ...context, message: "Yes" });
    expect(recorded.decision.goalAllocation).toMatchObject({
      status: "recorded",
      amountCents: 2400,
      goalName: "Emergency fund"
    });
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([{ amountCents: 2700 }]);
    expect(await tools.getEffectiveSavingsEntryAmount("user_123", "entry_1")).toBe(2400);
    expect(await tools.getWeeklySavingsTotal("user_123")).toBe(2400);
  });

  it("requires fresh approval if an entry changes after the goal proposal", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "stale_goal_amount" };
    await agent.respond({ ...context, message: "I almost bought a $27 pastry but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    const proposal = await agent.respond({ ...context, message: "Put that toward my emergency fund." });
    const [entry] = await tools.listSavingsEntries("user_123");
    expect(entry).toBeDefined();
    if (!entry) throw new Error("Expected the recent entry to exist.");

    await tools.createSavingsEntryCorrection({
      userId: "user_123",
      savingsEntryId: entry.id,
      correctedAmountCents: 2400,
      reason: "Updated amount",
      approvalId: "approval_external_correction",
      approvedActionId: "action_external_correction"
    });
    const refreshed = await agent.respond({ ...context, message: "Yes" });

    expect(refreshed.decision.action).toBe("update_goal");
    expect(refreshed.decision.goalAllocation).toMatchObject({ status: "pending", amountCents: 2400 });
    expect(refreshed.message).toContain("please confirm again");
    expect(refreshed.decision.toolCall?.actionId).not.toBe(proposal.decision.toolCall?.actionId);
    expect(await tools.listSavingsGoalAllocations("user_123")).toEqual([]);

    const recorded = await agent.respond({ ...context, message: "Yes" });
    expect(recorded.decision.goalAllocation).toMatchObject({ status: "recorded", amountCents: 2400 });
    expect(await tools.listSavingsGoalAllocations("user_123")).toHaveLength(1);
  });

  it("persists a goal decline only after an explicit no to the exact pending action", async () => {
    const tools = new MockVictoriaTools();
    let pending: PersistedPendingGoalAllocationAction | null = null;
    const terminalStatuses: string[] = [];
    const pendingStore: PendingGoalAllocationActionStore = {
      async getPending() { return pending; },
      async commit(input) {
        if (input.pendingAction) pending = input.pendingAction;
        if (input.terminalAction) {
          terminalStatuses.push(input.terminalAction.status);
          pending = null;
        }
      }
    };
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      pendingGoalAllocationActions: pendingStore
    });
    const context = { userId: "user_123", conversationId: "goal_decline" };
    await agent.respond({ ...context, message: "I almost bought a $27 pastry but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    await agent.respond({ ...context, message: "Put that toward my emergency fund." });

    const ambiguous = await agent.respond({ ...context, message: "Maybe later" });
    expect(ambiguous.decision.action).toBe("ask_follow_up");
    expect(terminalStatuses).toEqual([]);

    const declined = await agent.respond({ ...context, message: "No" });
    expect(declined.decision.action).toBe("reflect");
    expect(terminalStatuses).toEqual(["declined"]);
  });

  it("does not restore a pending savings action whose stored decision belongs to another user", async () => {
    const tools = new MockVictoriaTools();
    const ownerAgent = createAgent([], tools);
    const ownerDecision = await ownerAgent.respond({
      userId: "user_owner",
      conversationId: "shared_conversation",
      message: "I almost bought a $27 pastry but decided to wait."
    });
    const actionId = requireActionId(ownerDecision.decision.toolCall?.actionId);
    const pendingStore: PendingSavingsActionStore = {
      async getPending() { return { actionId, decision: ownerDecision.decision }; },
      async commit() {}
    };
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(),
      memory: new MockMemoryProvider(),
      tools,
      pendingSavingsActions: pendingStore
    });

    const response = await agent.respond({
      userId: "user_victim",
      conversationId: "shared_conversation",
      message: "Yes"
    });

    expect(response.decision.action).not.toBe("record_savings_entry");
    expect(await tools.listSavingsEntries("user_victim")).toEqual([]);
  });

  it("keeps a restored pending proposal and its dialogue inside the exact conversation", async () => {
    const tools = new MockVictoriaTools();
    const memory = new MockMemoryProvider();
    const stored = new Map<string, PersistedPendingSavingsAction>();
    const conversationKey = (userId: string, conversationId: string) => `${userId}:${conversationId}`;
    const pendingStore: PendingSavingsActionStore = {
      async getPending(userId, conversationId) {
        return stored.get(conversationKey(userId, conversationId)) ?? null;
      },
      async commit({ userId, conversationId, pendingAction, responseDecision }) {
        const key = conversationKey(userId, conversationId);
        if (pendingAction) stored.set(key, pendingAction);
        else if (responseDecision.proposal?.status === "recorded" || responseDecision.proposal?.status === "declined") {
          stored.delete(key);
        }
      }
    };
    const base = createMockAgentTeamSpecialists();
    const question = "What should I keep in mind for a relaxing Saturday?";
    const responder = vi.fn(async (input: ConversationResponderInput) => {
      expect(input.pendingAction).toBeUndefined();
      return "A slow morning and one enjoyable activity could be a good start.";
    });
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools, pendingSavingsActions: pendingStore,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { async analyze(input) {
        if (input.message === question) return { classification: {
          type: "general_finance", confidence: 0.95, summary: question, needsClarification: false
        } };
        return { classification: {
          type: "avoided_spend", confidence: 0.95, amountCents: 2_500,
          summary: input.message, needsClarification: false
        } };
      } } }
    });
    const owner = { userId: "same_user", conversationId: "proposal_owner_chat" };
    const other = { userId: "same_user", conversationId: "separate_chat" };
    const original = await agent.respond({ ...owner, message: "I almost bought a $25 book but decided to wait." });

    const unrelated = await agent.respond({ ...other, message: question });

    const snapshot = responder.mock.calls[0]?.[0].contextSnapshot;
    expect(unrelated.message).toContain("slow morning");
    expect(snapshot?.pendingAction).toBeUndefined();
    expect(snapshot?.financialContext?.workflowState).toBeUndefined();
    expect(snapshot?.financialContext?.conversationSavingsEvents).toEqual([]);
    expect(snapshot?.dialogueTurns.some(({ content }) => content.includes("$25 book"))).toBe(false);
    expect(await tools.listSavingsEntries(owner.userId)).toEqual([]);

    const approved = await agent.respond({ ...owner, message: "yes" });
    expect(approved.decision.action).toBe("create_ledger_entry");
    expect(approved.decision.proposal?.id).toBe(original.decision.proposal?.id);
    expect(await tools.listSavingsEntries(owner.userId)).toMatchObject([{ amountCents: 2500 }]);
  });

  it("keeps a restored goal allocation inside its owning conversation", async () => {
    const tools = new MockVictoriaTools();
    const memory = new MockMemoryProvider();
    const owner = { userId: "goal_scope_user", conversationId: "goal_owner_chat" };
    const ownerAgent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });
    await ownerAgent.respond({ ...owner, message: "I almost bought a $27 pastry but decided to wait." });
    await ownerAgent.respond({ ...owner, message: "Yes" });
    const proposal = await ownerAgent.respond({ ...owner, message: "Put that toward my emergency fund." });
    expect(proposal.decision.goalAllocation?.status).toBe("pending");
    const actionId = requireActionId(proposal.decision.toolCall?.actionId);
    const key = (userId: string, conversationId: string) => `${userId}:${conversationId}`;
    const stored = new Map<string, PersistedPendingGoalAllocationAction>([
      [key(owner.userId, owner.conversationId), { actionId, decision: proposal.decision }]
    ]);
    const pendingGoalAllocationActions: PendingGoalAllocationActionStore = {
      async getPending(userId, conversationId) { return stored.get(key(userId, conversationId)) ?? null; },
      async commit({ userId, conversationId, pendingAction, terminalAction }) {
        const scope = key(userId, conversationId);
        if (pendingAction) stored.set(scope, pendingAction);
        if (terminalAction) stored.delete(scope);
      }
    };
    const base = createMockAgentTeamSpecialists();
    const question = "What should I keep in mind for a relaxing Saturday?";
    const responder = vi.fn(async (input: ConversationResponderInput) => {
      expect(input.pendingAction).toBeUndefined();
      return "A slow morning and one enjoyable activity could be a good start.";
    });
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools, pendingGoalAllocationActions,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { async analyze(input) {
        if (input.message === question) return { classification: {
          type: "general_finance", confidence: 0.95, summary: question, needsClarification: false
        } };
        return base.financialMoment.analyze(input);
      } } }
    });
    const other = { userId: owner.userId, conversationId: "goal_other_chat" };

    await agent.respond({ ...other, message: question });

    const snapshot = responder.mock.calls[0]?.[0].contextSnapshot;
    expect(snapshot?.pendingAction).toBeUndefined();
    expect(snapshot?.financialContext?.workflowState).toBeUndefined();
    expect(snapshot?.dialogueTurns.some(({ content }) => content.includes("emergency fund"))).toBe(false);
    expect(await tools.listSavingsGoalAllocations(owner.userId)).toEqual([]);

    const approved = await agent.respond({ ...owner, message: "yes" });
    expect(approved.decision.goalAllocation).toMatchObject({ status: "recorded", approvedActionId: actionId });
    expect(await tools.listSavingsGoalAllocations(owner.userId)).toHaveLength(1);
  });

  it("keeps a restored entry correction inside its owning conversation", async () => {
    const tools = new MockVictoriaTools();
    const memory = new MockMemoryProvider();
    const owner = { userId: "correction_scope_user", conversationId: "correction_owner_chat" };
    const ownerAgent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });
    await ownerAgent.respond({ ...owner, message: "I almost bought a $27 pastry but decided to wait." });
    await ownerAgent.respond({ ...owner, message: "Yes" });
    const proposal = await ownerAgent.respond({ ...owner, message: "Correct that recorded entry to $24." });
    expect(proposal.decision.entryCorrection).toMatchObject({ status: "pending" });
    const actionId = requireActionId(proposal.decision.toolCall?.actionId);
    const key = (userId: string, conversationId: string) => `${userId}:${conversationId}`;
    const stored = new Map<string, PersistedPendingEntryCorrection>([
      [key(owner.userId, owner.conversationId), { actionId, decision: proposal.decision }]
    ]);
    const pendingEntryCorrections: PendingEntryCorrectionStore = {
      async getPending(userId, conversationId) { return stored.get(key(userId, conversationId)) ?? null; },
      async commit({ userId, conversationId, pendingAction, terminalAction }) {
        const scope = key(userId, conversationId);
        if (pendingAction) stored.set(scope, pendingAction);
        if (terminalAction) stored.delete(scope);
      }
    };
    const base = createMockAgentTeamSpecialists();
    const question = "What should I keep in mind for a relaxing Saturday?";
    const responder = vi.fn(async (input: ConversationResponderInput) => {
      expect(input.pendingAction).toBeUndefined();
      return "A slow morning and one enjoyable activity could be a good start.";
    });
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools, pendingEntryCorrections,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { async analyze(input) {
        if (input.message === question) return { classification: {
          type: "general_finance", confidence: 0.95, summary: question, needsClarification: false
        } };
        return base.financialMoment.analyze(input);
      } } }
    });
    const other = { userId: owner.userId, conversationId: "correction_other_chat" };

    await agent.respond({ ...other, message: question });

    const snapshot = responder.mock.calls[0]?.[0].contextSnapshot;
    expect(snapshot?.pendingAction).toBeUndefined();
    expect(snapshot?.financialContext?.workflowState).toBeUndefined();
    expect(snapshot?.dialogueTurns.some(({ content }) => content.includes("corrected entry to $24"))).toBe(false);
    expect(await tools.listSavingsEntryCorrections(owner.userId)).toEqual([]);

    const approved = await agent.respond({ ...owner, message: "yes" });
    expect(approved.decision.action).toBe("correct_ledger_entry");
    expect(approved.decision.entryCorrection).toMatchObject({ correctedAmountCents: 2400, approvedActionId: actionId });
    expect(await tools.listSavingsEntryCorrections(owner.userId)).toMatchObject([{ correctedAmountCents: 2400 }]);
  });

  it.each([
    { monthlyAmountCents: -3500, annualProjectionCents: -42000 },
    { monthlyAmountCents: 3500.5, annualProjectionCents: 42006 },
    { monthlyAmountCents: 3500, annualProjectionCents: 42100 },
    { monthlyAmountCents: 2700, annualProjectionCents: 32400 }
  ])("rejects an inconsistent restored planning choice before approval: %j", async (planningChoice) => {
    const tools = new MockVictoriaTools();
    const ownerAgent = createAgent([], tools);
    const request = { userId: "restore_validation_user", conversationId: "restore_validation_chat" };
    const original = await ownerAgent.respond({ ...request, message: "I almost bought a $35 jacket but decided to wait." });
    const actionId = requireActionId(original.decision.toolCall?.actionId);
    const pendingStore: PendingSavingsActionStore = {
      async getPending() { return { actionId, decision: { ...original.decision, planningChoice } }; },
      async commit() {}
    };
    const restored = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      pendingSavingsActions: pendingStore
    });
    const response = await restored.respond({ ...request, message: "yes" });

    expect(response.decision.action).not.toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("[IDM-002] retries an uncertain correction with the same approval", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "correction_retry" };
    await agent.respond({ ...context, message: "I almost bought a $27 pastry but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    await agent.respond({ ...context, message: "Correct that recorded entry to $24." });
    const createCorrection = tools.createSavingsEntryCorrection.bind(tools);
    const writeSpy = vi.spyOn(tools, "createSavingsEntryCorrection").mockImplementationOnce(async (input) => {
      await createCorrection(input);
      throw new Error("Response lost after persistence.");
    });

    const uncertain = await agent.respond({ ...context, message: "Yes" });
    expect(uncertain.decision.action).toBe("ask_follow_up");
    expect(await tools.listSavingsEntryCorrections("user_123")).toHaveLength(1);
    const retried = await agent.respond({ ...context, message: "Yes" });

    expect(retried.decision.action).toBe("correct_ledger_entry");
    expect(writeSpy.mock.calls).toHaveLength(2);
    expect(writeSpy.mock.calls[1]?.[0].approvalId).toBe(writeSpy.mock.calls[0]?.[0].approvalId);
    expect(await tools.listSavingsEntryCorrections("user_123")).toHaveLength(1);
    expect((await tools.listSavingsEntries("user_123"))[0]?.amountCents).toBe(2700);
    const [correction] = await tools.listSavingsEntryCorrections("user_123");
    expect(correction && Object.isFrozen(correction)).toBe(true);
    if (correction) expect(Reflect.set(correction, "adjustmentCents", 1)).toBe(false);
  });

  it("[COR-002] uses updated spending evidence for future suggestions without changing a pending one", async () => {
    const habits: UserHabit[] = [
      { userId: "user_123", id: "habit_7th_street", merchantName: "7th Street", typicalAmountCents: 2746, currency: "USD", confidence: 0.9 }
    ];
    const tools = new MockVictoriaTools(habits);
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(),
      memory: new MockMemoryProvider(habits),
      tools
    });
    const firstContext = { userId: "user_123", conversationId: "evolving_habit" };
    const firstSuggestion = await agent.respond({
      ...firstContext,
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    expect(firstSuggestion.decision.suggestion?.amountCents).toBe(2746);

    habits[0] = { ...habits[0]!, typicalAmountCents: 3100 };
    const confirmation = await agent.respond({ ...firstContext, message: "Yes" });
    expect(confirmation.decision.proposal?.suggestion.amountCents).toBe(2746);
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([{ amountCents: 2746 }]);

    const nextSuggestion = await agent.respond({
      userId: "user_123",
      conversationId: "evolving_habit_next",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    expect(nextSuggestion.decision.suggestion?.amountCents).toBe(3100);
    expect(nextSuggestion.decision.proposal?.suggestion.amountCents).toBe(3100);
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([{ amountCents: 2746 }]);
  });

  it("[MEM-001] keeps habits, goals, and remembered decisions scoped to their user", async () => {
    const habits: UserHabit[] = [
      { userId: "user_123", id: "habit_user_123", merchantName: "7th Street", typicalAmountCents: 2746, currency: "USD", confidence: 0.9 },
      { userId: "user_other", id: "habit_user_other", merchantName: "7th Street", typicalAmountCents: 1200, currency: "USD", confidence: 0.8 }
    ];
    const goals = [
      { userId: "user_123", id: "goal_123", name: "Emergency fund", savedAmountCents: 0, currency: "USD" as const },
      { userId: "user_other", id: "goal_other", name: "Trip", savedAmountCents: 0, currency: "USD" as const }
    ];
    const memory = new MockMemoryProvider(habits, goals);
    await memory.rememberDecision("user_123", { type: "avoided_spend", summary: "Made coffee at home." });

    expect(await memory.listHabits("user_123")).toMatchObject([{ id: "habit_user_123" }]);
    expect(await memory.listHabits("user_other")).toMatchObject([{ id: "habit_user_other" }]);
    expect(await memory.listGoals("user_123")).toMatchObject([{ id: "goal_123" }]);
    expect(await memory.listGoals("user_other")).toMatchObject([{ id: "goal_other" }]);
    expect((await memory.getMemoryForUser("user_other")).recentDecisions).toEqual([]);

    const tools = new MockVictoriaTools(habits);
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });
    const response = await agent.respond({
      userId: "user_other",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    expect(response.decision.suggestion?.amountCents).toBe(1200);
    expect(response.message).toContain("$12.00");
  });

  it("asks for the target entry when a correction has no conversation context", async () => {
    const agent = createAgent();
    const response = await agent.respond({ userId: "user_123", message: "Correct that recorded entry to $24." });
    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.toolCall).toBeUndefined();
    expect(response.message).toContain("Which recorded savings entry");
  });

  it("[ARC-001] turns malformed classifier amounts into clarification without a tool call", async () => {
    const malformedLlm = {
      classifyMessage: async () => ({
        type: "avoided_spend", confidence: 0.9, amountCents: Number.NaN,
        summary: "User avoided spending", needsClarification: false, approved: true
      }),
      draftResponse: async () => ""
    } as unknown as ConstructorParameters<typeof VictoriaAgent>[0]["llm"];
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: malformedLlm, memory: new MockMemoryProvider(), tools });
    const response = await agent.respond({ userId: "user_123", message: "I skipped a purchase." });
    expect(response.decision.classification.type).toBe("unclear");
    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.proposal).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[ARC-001] ignores untyped approval fields returned by the classifier", async () => {
    const llm = {
      classifyMessage: async () => ({
        type: "avoided_spend", confidence: 0.9, amountCents: 9000,
        summary: "A jacket purchase was avoided", needsClarification: false, approved: true
      }),
      draftResponse: async () => ""
    } as unknown as ConstructorParameters<typeof VictoriaAgent>[0]["llm"];
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm, memory: new MockMemoryProvider(), tools });
    const response = await agent.respond({ userId: "user_123", message: "I waited on the jacket." });
    expect(response.decision.action).toBe("suggest_savings");
    expect(response.decision.toolCall?.requiresApproval).toBe(true);
    expect(response.decision.classification).not.toHaveProperty("approved");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[ARC-002] does not propose an unsafe amount returned by an estimator", async () => {
    const tools = new MockVictoriaTools([{
      userId: "user_123", id: "bad_habit", merchantName: "Blue Bottle", typicalAmountCents: Number.MAX_SAFE_INTEGER + 1,
      currency: "USD", confidence: 0.9
    }]);
    const agent = createAgent([], tools);
    const response = await agent.respond({ userId: "user_123", message: "I made coffee at home instead of Blue Bottle." });
    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("plainly reports when no completed savings are recorded this week", async () => {
    const agent = createAgent();

    const response = await agent.respond({
      userId: "user_123",
      message: "How much have I saved this week?"
    });

    expect(response.decision.action).toBe("summarize_progress");
    expect(response.message).toContain("No savings have been recorded");
    expect(response.message).toContain("mocked Victoria savings ledger");
    expect(response.message).toContain("No real money has moved");
  });

  it("does not mistake a future savings intention for a progress question", async () => {
    const tools = new MockVictoriaTools();
    const weeklyTotal = vi.spyOn(tools, "getWeeklySavingsTotal");
    const agent = createAgent([], tools);

    const response = await agent.respond({
      userId: "user_123",
      message: "I plan to save more this week."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.classification.type).toBe("unclear");
    expect(weeklyTotal).not.toHaveBeenCalled();
  });

  it("reports a weekly progress lookup failure without crashing", async () => {
    const tools = new MockVictoriaTools();
    vi.spyOn(tools, "getWeeklySavingsTotal").mockRejectedValueOnce(
      new Error("Ledger summary unavailable.")
    );
    const agent = createAgent([], tools);

    const response = await agent.respond({
      userId: "user_123",
      message: "How much have I saved this week?"
    });

    expect(response.decision.action).toBe("summarize_progress");
    expect(response.message).toContain("couldn't load your weekly total");
  });

  it("[FIN-001] refuses a natural-language request to move money", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);

    const response = await agent.respond({
      userId: "user_123",
      message: "Move the money now."
    });

    expect(response.decision.action).toBe("refuse");
    expect(response.decision.classification.type).toBe("real_money_movement_request");
    expect(response.message).toContain("can't move real money");
    expect(response.message).toContain("mocked Victoria savings ledger");
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it.each([
    "Can you send $100 to my emergency fund?",
    "Take $30 out of checking and put it away for me.",
    "Please deposit $20 into my savings account."
  ])("[FIN-001] refuses a transfer request phrased as a goal or withdrawal: %s", async (message) => {
    const tools = new MockVictoriaTools();
    const response = await createAgent([], tools).respond({ userId: "user_123", message });

    expect(response.decision.classification.type).toBe("real_money_movement_request");
    expect(response.decision.action).toBe("refuse");
    expect(response.decision.toolCall).toBeUndefined();
    expect(response.message).toContain("can't move real money");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[FIN-001] deterministically refuses real-money wording even when a classifier labels it ordinary conversation", async () => {
    const llm = new MockLlmAdapter();
    vi.spyOn(llm, "classifyMessage").mockResolvedValue({
      type: "general_finance", confidence: 0.95, summary: "Deposit $20 into savings", needsClarification: false
    });
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm, memory: new MockMemoryProvider(), tools });

    const response = await agent.respond({ userId: "user_123", message: "Please deposit $20 into my savings account." });

    expect(response.decision.action).toBe("refuse");
    expect(response.decision.classification.type).toBe("real_money_movement_request");
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("does not decide that ambiguous move-over wording means a real transfer from the phrase alone", async () => {
    const classification = await new MockLlmAdapter().classifyMessage({
      userMessage: "Hey can we move over that's $37.46 that we talked about earlier?",
      memory: { habits: [], goals: [], recentDecisions: [] },
      conversationContext: ["I almost bought a $37.46 lunch but decided to wait."]
    });

    expect(classification.type).toBe("unclear");
    expect(classification.amountCents).toBe(3746);
  });

  it("[AMT-004] asks to clarify an avoided-spend amount with excess precision", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);

    const response = await agent.respond({
      userId: "user_123",
      message: "I almost bought a $6.755 pastry but decided to wait."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(response.message).toContain("more than two decimal places");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[AMT-005] asks for USD instead of converting an unsupported currency", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);

    const response = await agent.respond({
      userId: "user_123",
      message: "I almost bought a €20 pastry but decided to wait."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(response.message).toContain("USD amounts");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[AMT-002] clarifies zero and negative avoided-spend amounts without proposing savings", async () => {
    for (const amount of ["$0", "$0.00", "-$5", "$-5"]) {
      const tools = new MockVictoriaTools();
      const agent = createAgent([], tools);
      const response = await agent.respond({
        userId: "user_123",
        message: `I almost bought a pastry for ${amount} but decided to wait.`
      });

      expect(response.decision.action).toBe("ask_follow_up");
      expect(response.decision.suggestion).toBeUndefined();
      expect(response.decision.proposal).toBeUndefined();
      expect(response.decision.toolCall).toBeUndefined();
      expect(response.message).toContain("positive amount");
      expect(await tools.listSavingsEntries("user_123")).toEqual([]);
    }
  });

  it("[AMT-002] asks which amount to use when an avoided-spend message names two amounts", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const response = await agent.respond({
      userId: "user_123",
      message: "I almost bought a pastry for $6 or $8 but decided to wait."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(response.message).toContain("Which single amount in USD");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[AMT-002] requires an unambiguous revision before pending savings can be approved", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "multi_amount_revision" };
    const original = await agent.respond({
      ...context,
      message: "I almost bought a $20 pastry but decided to wait."
    });

    const ambiguousRevision = await agent.respond({
      ...context,
      message: "Actually, make that $6 or $8."
    });
    expect(ambiguousRevision.decision.action).toBe("ask_follow_up");
    expect(ambiguousRevision.message).toContain("haven't changed the pending suggestion");

    const unrelatedAmount = await agent.respond({ ...context, message: "I spent $12 on lunch." });
    expect(unrelatedAmount.decision.action).toBe("ask_follow_up");
    expect(unrelatedAmount.decision.proposal?.id).toBe(original.decision.proposal?.id);
    expect(unrelatedAmount.decision.toolCall?.actionId).toBe(original.decision.toolCall?.actionId);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const approvalBeforeClarification = await agent.respond({ ...context, message: "Yes" });
    expect(approvalBeforeClarification.decision.action).toBe("ask_follow_up");
    expect(approvalBeforeClarification.message).toContain("unambiguous amount");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const clarified = await agent.respond({ ...context, message: "Use $8." });
    expect(clarified.decision.proposal?.supersedesProposalId).toBe(original.decision.proposal?.id);
    expect(clarified.decision.suggestion?.amountCents).toBe(800);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("keeps the active proposal reference read-only while a revised amount is awaiting clarification", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const question = "Can you help me think through my budget?";
    const responder = vi.fn(async (input: ConversationResponderInput) => {
      expect(input.pendingAction).toBe("savings_entry");
      return "We can look at the tradeoffs without changing anything yet.";
    });
    let specialistSnapshot: Parameters<AgentTeamSpecialists["financialMoment"]["analyze"]>[0]["contextSnapshot"];
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { async analyze(input) {
        if (input.message === question) {
          specialistSnapshot = input.contextSnapshot;
          return { classification: {
            type: "general_finance", confidence: 0.95, summary: question, needsClarification: false
          } };
        }
        return base.financialMoment.analyze(input);
      } } }
    });
    const request = { userId: "revision_context_user", conversationId: "revision_context_chat" };
    const original = await agent.respond({ ...request, message: "I almost bought a $20 pastry but decided to wait." });
    await agent.respond({ ...request, message: "Actually, make that $6 or $8." });

    const reflection = await agent.respond({ ...request, message: question });

    const snapshot = responder.mock.calls[0]?.[0].contextSnapshot;
    expect(reflection.message).toContain("tradeoffs");
    expect(specialistSnapshot).toBeUndefined();
    expect(snapshot).toBeDefined();
    expect(snapshot?.pendingAction).toBe("savings_entry");
    expect(snapshot?.financialContext?.workflowState).toMatchObject({
      status: "awaiting_confirmation", actionId: original.decision.toolCall?.actionId,
      proposalId: original.decision.proposal?.id, awaitingValidRevision: true,
      pendingRecordableAmountCents: 2000
    });
    expect(snapshot?.financialContext?.workflowState?.status === "awaiting_confirmation" &&
      snapshot.financialContext.workflowState.currentMessageProposalReference).toBeUndefined();
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);

    const approvalAttempt = await agent.respond({ ...request, message: "Yes" });
    expect(approvalAttempt.decision.action).toBe("ask_follow_up");
    expect(approvalAttempt.message).toContain("valid USD amount");
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("passes the scoped missing-amount state to a read-only responder without exposing event history", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const question = "What are some easy ways to make cooking more fun?";
    const responder = vi.fn(async (input: ConversationResponderInput) => {
      expect(input.pendingAction).toBeUndefined();
      return "You could try one new recipe or cook with someone you enjoy spending time with.";
    });
    let specialistSnapshot: Parameters<AgentTeamSpecialists["financialMoment"]["analyze"]>[0]["contextSnapshot"];
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { async analyze(input) {
        if (input.message === question) {
          specialistSnapshot = input.contextSnapshot;
          return { classification: {
            type: "general_finance", confidence: 0.95, summary: question, needsClarification: false
          } };
        }
        return base.financialMoment.analyze(input);
      } } }
    });
    const request = { userId: "amount_context_user", conversationId: "amount_context_chat" };
    const clarification = await agent.respond({ ...request, message: "I cooked instead of ordering takeout." });
    expect(clarification.decision.action).toBe("ask_follow_up");

    const reflection = await agent.respond({ ...request, message: question });

    const snapshot = responder.mock.calls[0]?.[0].contextSnapshot;
    expect(reflection.message).toContain("one new recipe");
    expect(snapshot).toBe(specialistSnapshot);
    expect(snapshot?.pendingAction).toBeUndefined();
    expect(snapshot?.financialContext?.workflowState).toMatchObject({
      status: "awaiting_amount", missingInformation: "amount",
      sourceEvent: { id: clarification.decision.savingsEvent?.id, summary: expect.any(String) }
    });
    expect(snapshot?.financialContext?.conversationSavingsEvents).toEqual([]);
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("does not approve the original amount when a pending amount correction is invalid", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "invalid_pending_amount" };
    await agent.respond({ ...context, message: "I almost bought a $20 pastry but decided to wait." });

    const correction = await agent.respond({ ...context, message: "Actually, make that $6.755." });

    expect(correction.decision.action).toBe("ask_follow_up");
    expect(correction.message).toContain("haven't changed the pending suggestion");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const attemptedApproval = await agent.respond({ ...context, message: "Yes" });
    expect(attemptedApproval.decision.action).toBe("ask_follow_up");
    expect(attemptedApproval.message).toContain("valid USD amount");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const corrected = await agent.respond({ ...context, message: "It was $6.75." });
    expect(corrected.decision.action).toBe("suggest_savings");
    expect(corrected.decision.proposal?.supersedesProposalId).toBe(
      correction.decision.proposal?.id
    );
    expect(corrected.decision.suggestion?.amountCents).toBe(675);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[FIN-001] does not treat a transfer request as approval for a pending mocked entry", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "transfer_conversation" };

    await agent.respond({
      ...context,
      message: "I almost bought a $45 book but decided to wait."
    });
    const response = await agent.respond({ ...context, message: "Move the money now." });

    expect(response.decision.action).toBe("refuse");
    expect(response.message).toContain("can't move real money");
    expect(response.message).toContain("$45.00");
    expect(response.message).toContain("after you confirm");
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[APR-003] binds a goal allocation to a fresh approval before recording it", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "goal_conversation" };
    const suggestion = await agent.respond({
      ...context,
      message: "I almost bought a $45 book but decided to wait."
    });
    const oldActionId = requireActionId(suggestion.decision.toolCall?.actionId);
    const originalProposalId = suggestion.decision.proposal?.id;

    const allocation = await agent.respond({
      ...context,
      message: "Put this toward my emergency fund."
    });

    const updatedActionId = requireActionId(allocation.decision.toolCall?.actionId);
    expect(updatedActionId).not.toBe(oldActionId);
    expect(allocation.decision.action).toBe("update_goal");
    expect(allocation.decision.proposal?.id).not.toBe(originalProposalId);
    expect(allocation.decision.proposal).toMatchObject({
      supersedesProposalId: originalProposalId,
      status: "pending",
      goalName: "Emergency fund"
    });
    expect(allocation.decision.toolCall?.arguments).toMatchObject({ goalName: "Emergency fund" });
    expect(allocation.message).toContain("$45.00");
    expect(allocation.message).toContain("Emergency fund");
    expect(allocation.message).toContain("confirm");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const confirmation = await agent.respond({ ...context, message: "Yes" });

    expect(confirmation.decision.action).toBe("create_ledger_entry");
    expect(confirmation.decision.proposal).toMatchObject({
      status: "recorded",
      goalName: "Emergency fund",
      approval: { actionId: updatedActionId }
    });
    expect(confirmation.message).toContain("Emergency fund");
    expect(confirmation.message).toContain("No real money has moved");
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([
      { amountCents: 4500, goalName: "Emergency fund", movementMode: "mock_ledger" }
    ]);

    const staleApproval = await agent.approveToolCall(
      { ...context, message: "Yes", approvedActionId: oldActionId },
      suggestion.decision
    );
    expect(staleApproval.decision.action).toBe("refuse");
  });

  it("[APR-005] replaces a pending proposal when the user corrects its amount", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "amount_revision" };
    const original = await agent.respond({
      ...context,
      message: "I almost bought a $90 jacket but decided to wait."
    });
    const originalActionId = requireActionId(original.decision.toolCall?.actionId);
    const originalProposalId = original.decision.proposal?.id;

    const revision = await agent.respond({
      ...context,
      message: "Actually, make that $75 instead."
    });

    const revisedActionId = requireActionId(revision.decision.toolCall?.actionId);
    expect(revision.decision.action).toBe("suggest_savings");
    expect(revision.decision.proposal?.id).not.toBe(originalProposalId);
    expect(revision.decision.proposal?.supersedesProposalId).toBe(originalProposalId);
    expect(revision.decision.proposal?.actionId).toBe(revisedActionId);
    expect(revision.decision.proposalTransitions?.at(-1)).toMatchObject({
      proposalId: originalProposalId, actionId: originalActionId, to: "superseded",
      supersededByProposalId: revision.decision.proposal?.id
    });
    expect(revision.decision.suggestion).toMatchObject({
      amountCents: 7500,
      source: "user_provided"
    });
    expect(revisedActionId).not.toBe(originalActionId);
    expect(original.decision.proposal?.status).toBe("pending");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const oldApproval = await agent.approveToolCall(
      { ...context, message: "Yes", approvedActionId: originalActionId },
      original.decision
    );
    expect(oldApproval.decision.action).toBe("refuse");

    const confirmation = await agent.respond({ ...context, message: "Yes" });
    expect(confirmation.decision.proposal).toMatchObject({
      status: "recorded",
      approval: { actionId: revisedActionId }
    });
    expect(confirmation.decision.proposalTransitions?.at(-1)).toMatchObject({
      to: "recorded", proposalId: revision.decision.proposal?.id, actionId: revisedActionId
    });
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([
      { amountCents: 7500, movementMode: "mock_ledger" }
    ]);
  });

  it("keeps a pending proposal unchanged when a revision classification has no grounded proposal reference", async () => {
    const tools = new MockVictoriaTools();
    const llm = new MockLlmAdapter();
    const delegate = new MockLlmAdapter();
    vi.spyOn(llm, "classifyMessage").mockImplementation(async (input) => {
      if (input.userMessage === "I changed my mind.") {
        return {
          type: "proposal_revision", confidence: 0.99, amountCents: 7_500,
          summary: input.userMessage, needsClarification: false
        };
      }
      return delegate.classifyMessage(input);
    });
    const agent = new VictoriaAgent({ llm, memory: new MockMemoryProvider(), tools });
    const context = { userId: "unreferenced_revision_user", conversationId: "unreferenced_revision_chat" };
    const original = await agent.respond({
      ...context,
      message: "I almost bought a $90 jacket but decided to wait."
    });
    const originalActionId = requireActionId(original.decision.toolCall?.actionId);
    const originalProposalId = original.decision.proposal?.id;

    const unclearRevision = await agent.respond({ ...context, message: "I changed my mind." });

    expect(unclearRevision.decision.action).toBe("ask_follow_up");
    expect(unclearRevision.message).toContain("active savings suggestion");
    expect(unclearRevision.decision.proposal?.id).toBe(originalProposalId);
    expect(unclearRevision.decision.proposal?.status).toBe("pending");
    expect(unclearRevision.decision.toolCall?.actionId).toBe(originalActionId);
    expect(await tools.listSavingsEntries(context.userId)).toEqual([]);

    const ungroundedApproval = await agent.respond({ ...context, message: "Yes" });
    expect(ungroundedApproval.decision.action).toBe("ask_follow_up");
    expect(ungroundedApproval.message).toContain("can't target an older event");
    expect(ungroundedApproval.decision.proposal?.id).toBe(originalProposalId);
    expect(await tools.listSavingsEntries(context.userId)).toEqual([]);

    const decline = await agent.respond({ ...context, message: "No" });
    expect(decline.decision.proposal).toMatchObject({ status: "declined", id: originalProposalId });
    expect(await tools.listSavingsEntries(context.userId)).toEqual([]);
  });

  it("gates ambiguous amounts for an explicitly referenced revision before classifier output", async () => {
    const tools = new MockVictoriaTools();
    const llm = new MockLlmAdapter();
    const delegate = new MockLlmAdapter();
    const ambiguous = "Actually, make that $6 or $8.";
    const classify = vi.spyOn(llm, "classifyMessage").mockImplementation(async (input) => {
      if (input.userMessage === ambiguous) throw new Error("The classifier should not control amount ambiguity.");
      return delegate.classifyMessage(input);
    });
    const agent = new VictoriaAgent({ llm, memory: new MockMemoryProvider(), tools });
    const context = { userId: "deterministic_revision_gate", conversationId: "revision_gate_chat" };
    const original = await agent.respond({ ...context, message: "I almost bought a $20 pastry but decided to wait." });

    const clarification = await agent.respond({ ...context, message: ambiguous });
    expect(classify).toHaveBeenCalledTimes(1);
    expect(clarification.decision.action).toBe("ask_follow_up");
    expect(clarification.decision.classification).toMatchObject({
      type: "proposal_revision", amountIssue: "multiple_amounts", needsClarification: true
    });
    expect(clarification.decision.proposal?.id).toBe(original.decision.proposal?.id);
    expect(clarification.message).toContain("Which single amount in USD");
    expect(await tools.listSavingsEntries(context.userId)).toEqual([]);

    const staleApproval = await agent.respond({ ...context, message: "Yes" });
    expect(staleApproval.decision.action).toBe("ask_follow_up");
    expect(staleApproval.message).toContain("valid USD amount");
    expect(staleApproval.decision.proposal?.id).toBe(original.decision.proposal?.id);
    expect(await tools.listSavingsEntries(context.userId)).toEqual([]);

    const corrected = await agent.respond({ ...context, message: "Use $8." });
    expect(corrected.decision.proposal).toMatchObject({
      supersedesProposalId: original.decision.proposal?.id,
      suggestion: { amountCents: 800 }
    });
    expect(await tools.listSavingsEntries(context.userId)).toEqual([]);
  });

  it("does not retarget an older event reference or treat its later amount or yes as the active proposal", async () => {
    const tools = new MockVictoriaTools();
    const llm = new MockLlmAdapter();
    const base = createMockAgentTeamSpecialists();
    const otherEventRequest = "Actually revise my coffee-shop purchase to $8.";
    const agent = new VictoriaAgent({
      llm, memory: new MockMemoryProvider(), tools,
      specialists: {
        ...base,
        financialMoment: {
          async analyze(input) {
            if (input.message === otherEventRequest) return { classification: {
              type: "proposal_revision", confidence: 1, amountCents: 800,
              summary: input.message, needsClarification: false
            } };
            return base.financialMoment.analyze(input);
          }
        }
      }
    });
    const context = { userId: "non_active_event_revision", conversationId: "non_active_event_chat" };
    const original = await agent.respond({ ...context, message: "I almost bought a $20 pastry but decided to wait." });

    const clarification = await agent.respond({ ...context, message: otherEventRequest });
    expect(clarification.decision.action).toBe("ask_follow_up");
    expect(clarification.decision.proposal?.id).toBe(original.decision.proposal?.id);
    expect(clarification.message).toContain("can't target an older event");
    expect(await tools.listSavingsEntries(context.userId)).toEqual([]);

    const amountOnly = await agent.respond({ ...context, message: "Use $8." });
    expect(amountOnly.decision.action).toBe("ask_follow_up");
    expect(amountOnly.decision.proposal?.id).toBe(original.decision.proposal?.id);
    expect(amountOnly.message).toContain("decline the current suggestion");

    const staleApproval = await agent.respond({ ...context, message: "Yes" });
    expect(staleApproval.decision.action).toBe("ask_follow_up");
    expect(staleApproval.decision.proposal?.id).toBe(original.decision.proposal?.id);
    expect(await tools.listSavingsEntries(context.userId)).toEqual([]);

    const decline = await agent.respond({ ...context, message: "No" });
    expect(decline.decision.proposal?.status).toBe("declined");
    expect(await tools.listSavingsEntries(context.userId)).toEqual([]);
  });

  it("restores a pending revision clarification across agent restarts", async () => {
    const tools = new MockVictoriaTools();
    const memory = new MockMemoryProvider();
    const context = { userId: "revision_restart_user", conversationId: "revision_restart_chat" };
    const persisted: { current: PersistedPendingSavingsAction | null } = { current: null };
    let idSequence = 0;
    const pendingStore: PendingSavingsActionStore = {
      async getPending(userId, conversationId) {
        return userId === context.userId && conversationId === context.conversationId ? persisted.current : null;
      },
      async commit(input) {
        if (input.pendingAction) {
          persisted.current = input.pendingAction;
          return;
        }
        if (persisted.current && input.responseDecision.proposalTransitions?.some((transition) =>
          transition.actionId === persisted.current?.actionId)) persisted.current = null;
      }
    };
    const createRestartedAgent = () => new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools, pendingSavingsActions: pendingStore,
      idFactory: () => String(++idSequence)
    });

    const firstAgent = createRestartedAgent();
    const original = await firstAgent.respond({
      ...context,
      message: "I almost bought a $20 pastry but decided to wait."
    });
    const originalActionId = requireActionId(original.decision.toolCall?.actionId);
    const originalProposalId = original.decision.proposal?.id;
    await firstAgent.respond({ ...context, message: "Actually, make that $6 or $8." });
    expect(persisted.current?.awaitingValidRevision).toBe(true);

    const restartedAgent = createRestartedAgent();
    const staleApproval = await restartedAgent.respond({ ...context, message: "Yes" });
    expect(staleApproval.decision.action).toBe("ask_follow_up");
    expect(staleApproval.decision.proposal?.id).toBe(originalProposalId);
    expect(staleApproval.decision.toolCall?.actionId).toBe(originalActionId);
    expect(await tools.listSavingsEntries(context.userId)).toEqual([]);

    const revised = await restartedAgent.respond({ ...context, message: "Use $8." });
    const revisedActionId = requireActionId(revised.decision.toolCall?.actionId);
    expect(revised.decision.proposal).toMatchObject({
      supersedesProposalId: originalProposalId,
      suggestion: { amountCents: 800 }
    });
    expect(revisedActionId).not.toBe(originalActionId);
    expect(persisted.current?.awaitingValidRevision).toBeUndefined();

    const secondRestart = createRestartedAgent();
    const approved = await secondRestart.respond({ ...context, message: "Yes" });
    expect(approved.decision.proposal).toMatchObject({
      status: "recorded", suggestion: { amountCents: 800 }, approval: { actionId: revisedActionId }
    });
    expect(await tools.listSavingsEntries(context.userId)).toMatchObject([{ amountCents: 800 }]);
  });

  it("[APR-005] replaces a pending proposal when the user changes its reason", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "reason_revision" };
    const original = await agent.respond({
      ...context,
      message: "I almost bought a $90 jacket but decided to wait."
    });
    const originalProposalId = original.decision.proposal?.id;
    const originalActionId = requireActionId(original.decision.toolCall?.actionId);

    const revision = await agent.respond({
      ...context,
      message: "Change the reason to I waited until payday."
    });

    const revisedActionId = requireActionId(revision.decision.toolCall?.actionId);
    expect(revision.decision.proposal?.id).not.toBe(originalProposalId);
    expect(revision.decision.proposal?.supersedesProposalId).toBe(originalProposalId);
    expect(revision.decision.suggestion?.reason).toBe("I waited until payday.");
    expect(revisedActionId).not.toBe(originalActionId);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const confirmation = await agent.respond({ ...context, message: "Yes" });
    expect(confirmation.decision.proposal).toMatchObject({
      status: "recorded",
      approval: { actionId: revisedActionId }
    });
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([
      { amountCents: 9000, reason: "I waited until payday." }
    ]);
  });

  it("[APR-005] keeps unsupported currency revisions from changing the pending payload", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "currency_revision" };
    const original = await agent.respond({
      ...context,
      message: "I almost bought a $90 jacket but decided to wait."
    });
    const originalActionId = requireActionId(original.decision.toolCall?.actionId);
    const originalProposalId = original.decision.proposal?.id;

    const revision = await agent.respond({ ...context, message: "Change the currency to EUR." });

    expect(revision.decision.action).toBe("ask_follow_up");
    expect(revision.message).toContain("only revise the amount or reason");
    expect(revision.decision.proposal?.id).toBe(originalProposalId);
    expect(revision.decision.toolCall?.actionId).toBe(originalActionId);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const confirmation = await agent.respond({ ...context, message: "Yes" });
    expect(confirmation.decision.proposal).toMatchObject({
      status: "recorded",
      suggestion: { amountCents: 9000, currency: "USD", movementMode: "mock_ledger" }
    });
  });

  it("asks which saved amount a goal request refers to when there is no pending suggestion", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);

    const response = await agent.respond({
      userId: "user_123",
      message: "Put this toward my emergency fund."
    });

    expect(response.decision.action).toBe("update_goal");
    expect(response.message).toContain("Which saved amount");
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("does not reuse an older confirmed entry after a newer suggestion is declined", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "recent_entry_context" };

    await agent.respond({ ...context, message: "I almost bought a $20 item but decided not to." });
    await agent.respond({ ...context, message: "Yes" });
    await agent.respond({ ...context, message: "I almost bought a $45 item but decided not to." });
    await agent.respond({ ...context, message: "Not today." });

    const response = await agent.respond({
      ...context,
      message: "Put this toward my emergency fund."
    });

    expect(response.decision.action).toBe("update_goal");
    expect(response.message).toContain("Which saved amount");
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsGoalAllocations("user_123")).toEqual([]);
    expect(await tools.listSavingsEntries("user_123")).toHaveLength(1);
  });

  it("[APR-007] records a confirmed-entry goal allocation as linked history", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "confirmed_goal_conversation" };

    await agent.respond({
      ...context,
      message: "I almost bought a $45 book but decided to wait."
    });
    await agent.respond({ ...context, message: "Yes" });
    const [originalEntry] = await tools.listSavingsEntries("user_123");
    expect(originalEntry).toBeDefined();

    const proposal = await agent.respond({
      ...context,
      message: "Put that toward my emergency fund."
    });

    const actionId = requireActionId(proposal.decision.toolCall?.actionId);
    expect(proposal.decision.action).toBe("update_goal");
    expect(proposal.decision.goalAllocation).toMatchObject({
      status: "pending",
      savingsEntryId: originalEntry?.id,
      amountCents: 4500,
      goalName: "Emergency fund"
    });
    expect(proposal.decision.toolCall).toMatchObject({
      name: "createSavingsGoalAllocation",
      requiresApproval: true,
      arguments: {
        savingsEntryId: originalEntry?.id,
        amountCents: 4500,
        goalName: "Emergency fund"
      }
    });
    expect(await tools.listSavingsGoalAllocations("user_123")).toEqual([]);
    expect(await tools.listSavingsEntries("user_123")).toEqual([originalEntry]);

    const wrongUserApproval = await agent.approveToolCall(
      { userId: "user_other", message: "Yes", approvedActionId: actionId },
      proposal.decision
    );
    expect(wrongUserApproval.decision.action).toBe("refuse");
    expect(await tools.listSavingsGoalAllocations("user_123")).toEqual([]);

    const unclearConfirmation = await agent.respond({ ...context, message: "Maybe." });
    expect(unclearConfirmation.decision.action).toBe("ask_follow_up");
    expect(unclearConfirmation.message).toContain("clear yes or no");
    expect(await tools.listSavingsGoalAllocations("user_123")).toEqual([]);

    const confirmation = await agent.respond({ ...context, message: "Yes" });

    expect(confirmation.decision.action).toBe("record_goal_allocation");
    expect(confirmation.decision.goalAllocation).toMatchObject({
      status: "recorded",
      savingsEntryId: originalEntry?.id,
      amountCents: 4500,
      goalName: "Emergency fund",
      approval: { actionId }
    });
    expect(confirmation.message).toContain("$45.00");
    expect(confirmation.message).toContain("Emergency fund");
    expect(confirmation.message).toContain("No real money has moved");
    expect(await tools.listSavingsEntries("user_123")).toEqual([originalEntry]);
    const allocations = await tools.listSavingsGoalAllocations("user_123");
    expect(allocations).toMatchObject([
      {
        savingsEntryId: originalEntry?.id,
        amountCents: 4500,
        goalName: "Emergency fund",
        approvedActionId: actionId
      }
    ]);
    const [recordedAllocation] = allocations;
    expect(recordedAllocation).toBeDefined();
    if (!recordedAllocation) throw new Error("Expected the goal allocation to be recorded.");

    const retriedAllocation = await tools.createSavingsGoalAllocation({
      userId: "user_123",
      savingsEntryId: recordedAllocation.savingsEntryId,
      amountCents: recordedAllocation.amountCents,
      goalName: recordedAllocation.goalName,
      approval: recordedAllocation.approval,
      approvedActionId: recordedAllocation.approvedActionId
    });

    expect(retriedAllocation).toEqual(recordedAllocation);
    await expect(tools.createSavingsGoalAllocation({
      userId: "user_123",
      savingsEntryId: recordedAllocation.savingsEntryId,
      amountCents: recordedAllocation.amountCents,
      goalName: "Vacation",
      approval: recordedAllocation.approval,
      approvedActionId: recordedAllocation.approvedActionId
    })).rejects.toThrow("An approved action cannot be reused for a different goal allocation.");
    expect(await tools.listSavingsGoalAllocations("user_123")).toEqual([recordedAllocation]);
    const replay = await agent.respond({ ...context, message: "Yes" });
    expect(replay.decision.action).not.toBe("record_goal_allocation");
    expect(await tools.listSavingsGoalAllocations("user_123")).toHaveLength(allocations.length);

    const replayedApproval = await agent.approveToolCall(
      { ...context, message: "Yes", approvedActionId: actionId },
      proposal.decision
    );
    expect(replayedApproval.decision.action).toBe("refuse");
    expect(await tools.listSavingsGoalAllocations("user_123")).toHaveLength(allocations.length);
  });

  it("[IDM-002] retries an uncertain goal allocation with the same approval", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "goal_allocation_retry" };
    await agent.respond({ ...context, message: "I almost bought a $45 book but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    await agent.respond({ ...context, message: "Put that toward my emergency fund." });
    const createAllocation = tools.createSavingsGoalAllocation.bind(tools);
    const writeSpy = vi.spyOn(tools, "createSavingsGoalAllocation").mockImplementationOnce(async (input) => {
      await createAllocation(input);
      throw new Error("Response lost after persistence.");
    });

    const uncertain = await agent.respond({ ...context, message: "Yes" });
    expect(uncertain.decision.action).toBe("ask_follow_up");
    expect(await tools.listSavingsGoalAllocations("user_123")).toHaveLength(1);
    const retried = await agent.respond({ ...context, message: "Yes" });

    expect(retried.decision.action).toBe("record_goal_allocation");
    expect(writeSpy.mock.calls).toHaveLength(2);
    expect(writeSpy.mock.calls[1]?.[0].approval.id).toBe(writeSpy.mock.calls[0]?.[0].approval.id);
    expect(await tools.listSavingsGoalAllocations("user_123")).toHaveLength(1);
    const [allocation] = await tools.listSavingsGoalAllocations("user_123");
    expect(allocation && Object.isFrozen(allocation)).toBe(true);
    if (allocation) expect(Object.isFrozen(allocation.approval)).toBe(true);
  });

  it("retries a goal allocation after the tool commits but its response is lost", async () => {
    const tools = new MockVictoriaTools();
    const createAllocation = tools.createSavingsGoalAllocation.bind(tools);
    vi.spyOn(tools, "createSavingsGoalAllocation").mockImplementationOnce(async (input) => {
      await createAllocation(input);
      throw new Error("Response lost after commit.");
    });
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "goal_retry" };

    await agent.respond({ ...context, message: "I almost bought a $45 book but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    await agent.respond({ ...context, message: "Put that toward my emergency fund." });

    const retryPrompt = await agent.respond({ ...context, message: "Yes" });
    expect(retryPrompt.decision.action).toBe("ask_follow_up");
    expect(await tools.listSavingsGoalAllocations("user_123")).toHaveLength(1);

    const recovered = await agent.respond({ ...context, message: "Yes" });
    expect(recovered.decision.action).toBe("record_goal_allocation");
    expect(await tools.listSavingsGoalAllocations("user_123")).toHaveLength(1);
  });

  it("clears a declined goal allocation without recording it", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "goal_decline" };

    await agent.respond({ ...context, message: "I almost bought a $45 book but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    await agent.respond({ ...context, message: "Put that toward my emergency fund." });

    const declined = await agent.respond({ ...context, message: "No, not today." });
    expect(declined.decision.action).toBe("reflect");
    expect(await tools.listSavingsGoalAllocations("user_123")).toEqual([]);

    const laterApproval = await agent.respond({ ...context, message: "Yes" });
    expect(laterApproval.decision.action).not.toBe("record_goal_allocation");
    expect(await tools.listSavingsGoalAllocations("user_123")).toEqual([]);
  });

  it("[INT-002] [AUD-001] [AUD-004] completes the explicit-amount savings loop through conversation", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);

    const suggestion = await agent.respond({
      userId: "user_123",
      conversationId: "conversation_123",
      message: "I almost bought a $90 jacket but decided to wait."
    });

    expect(suggestion.decision.action).toBe("suggest_savings");
    expect(suggestion.decision.savingsEvent).toMatchObject({
      id: "event_1",
      userId: "user_123",
      type: "avoided_spend",
      summary: "I almost bought a $90 jacket but decided to wait.",
      userProvidedAmountCents: 9000
    });
    expect(Date.parse(suggestion.decision.savingsEvent?.createdAt ?? "")).not.toBeNaN();
    expect(suggestion.decision.proposal).toMatchObject({
      id: "proposal_1",
      eventId: "event_1",
      userId: "user_123",
      status: "pending",
      suggestion: {
        amountCents: 9000,
        source: "user_provided",
        movementMode: "mock_ledger"
      }
    });
    expect(Date.parse(suggestion.decision.proposal?.createdAt ?? "")).not.toBeNaN();
    expect(suggestion.message).toContain("$90.00");
    expect(suggestion.message).toContain("amount you provided");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const confirmation = await agent.respond({
      userId: "user_123",
      conversationId: "conversation_123",
      message: "Yes"
    });

    expect(confirmation.decision.action).toBe("create_ledger_entry");
    expect(confirmation.decision.proposal).toMatchObject({
      id: "proposal_1",
      eventId: "event_1",
      userId: "user_123",
      status: "recorded",
      approval: {
        id: "approval_1",
        proposalId: "proposal_1",
        userId: "user_123",
        actionId: "savings_action_1",
        source: "user_message"
      }
    });
    expect(Date.parse(confirmation.decision.proposal?.status === "recorded"
      ? confirmation.decision.proposal.approval.approvedAt
      : "")).not.toBeNaN();
    expect(confirmation.message).toBe(
      "Done. I recorded $90.00 in your Victoria savings ledger. Your total in the mocked Victoria savings ledger this week is $90.00. No real money has moved yet."
    );
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([
      {
        userId: "user_123",
        eventId: "event_1",
        proposalId: "proposal_1",
        approvalId: "approval_1",
        approvedActionId: "savings_action_1",
        amountCents: 9000,
        movementMode: "mock_ledger",
        status: "completed"
      }
    ]);
  });

  it("[APR-003] does not treat ambiguous confirmation language as approval", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);

    await agent.respond({
      userId: "user_123",
      conversationId: "conversation_123",
      message: "I almost bought a $90 jacket but decided to wait."
    });

    const response = await agent.respond({
      userId: "user_123",
      conversationId: "conversation_123",
      message: "Sure, I guess"
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.message).toContain("clear yes or no");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it.each(["Okay", "Sure", "Sounds good"])(
    "[APR-008] asks for clear approval after the ambiguous reply %s",
    async (message) => {
      const tools = new MockVictoriaTools();
      const agent = createAgent([], tools);
      const context = { userId: "user_123", conversationId: "conversation_123" };

      await agent.respond({
        ...context,
        message: "I almost bought a $90 jacket but decided to wait."
      });
      const response = await agent.respond({ ...context, message });

      expect(response.decision.action).toBe("ask_follow_up");
      expect(response.message).toContain("clear yes or no");
      expect(await tools.listSavingsEntries("user_123")).toEqual([]);
    }
  );

  it("[APR-004] declines a pending savings proposal without pressure or a ledger entry", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "conversation_123" };
    const suggestion = await agent.respond({
      ...context,
      message: "I almost bought a $90 jacket but decided to wait."
    });

    const response = await agent.respond({ ...context, message: "Not today." });

    expect(response.decision.action).toBe("reflect");
    expect(response.decision.proposal).toMatchObject({
      id: "proposal_1",
      status: "declined",
      eventId: "event_1"
    });
    expect(response.decision.proposal).toHaveProperty("declinedAt");
    expect(response.decision.proposalTransitions?.at(-1)).toMatchObject({
      proposalId: suggestion.decision.proposal?.id,
      actionId: suggestion.decision.proposal?.actionId,
      from: "pending", to: "declined"
    });
    expect(response.message).toBe("No problem. I won't record it.");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const afterDecline = await agent.respond({ ...context, message: "Yes" });
    expect(afterDecline.decision.action).not.toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
    expect(suggestion.decision.proposal?.status).toBe("pending");
  });

  it("does not create a second entry when confirmation is repeated", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = {
      userId: "user_123",
      conversationId: "conversation_123"
    };

    await agent.respond({
      ...context,
      message: "I almost bought a $90 jacket but decided to wait."
    });
    await agent.respond({ ...context, message: "Yes" });
    const repeated = await agent.respond({ ...context, message: "Yes" });

    expect(repeated.decision.action).not.toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries("user_123")).toHaveLength(1);
  });

  it("suggests saving avoided spend without creating a ledger entry immediately", async () => {
    const agent = createAgent([
      {
        id: "habit_7th_street",
        merchantName: "7th Street",
        userId: "user_123",
        typicalAmountCents: 2746,
        currency: "USD",
        confidence: 0.9
      }
    ]);

    const response = await agent.respond({
      userId: "user_123",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });

    expect(response.decision.action).toBe("suggest_savings");
    expect(response.decision.suggestion?.amountCents).toBe(2746);
    expect(response.decision.toolCall?.name).toBe("createSavingsEntry");
    expect(response.decision.toolCall?.actionId).toBeTruthy();
    expect(response.decision.toolCall?.requiresApproval).toBe(true);
    expect(response.message).toContain("$27.46");
    expect(response.message).toContain("record");
    expect(response.message).toContain("No real money has moved yet.");
  });

  it("[AUD-001] prefers a user-provided amount over merchant history when both are present", async () => {
    const tools = new MockVictoriaTools([
      {
        id: "habit_doordash",
        merchantName: "DoorDash",
        userId: "user_123",
        typicalAmountCents: 2746,
        currency: "USD",
        confidence: 0.9
      }
    ]);
    const agent = createAgent(
      [
        {
          id: "habit_doordash",
          merchantName: "DoorDash",
          userId: "user_123",
          typicalAmountCents: 2746,
          currency: "USD",
          confidence: 0.9
        }
      ],
      tools
    );

    const response = await agent.respond({
      userId: "user_123",
      message: "I almost ordered $31.50 from DoorDash but cooked instead."
    });

    expect(response.decision.action).toBe("suggest_savings");
    expect(response.decision.savingsEvent).toMatchObject({
      merchantName: "DoorDash",
      userProvidedAmountCents: 3150
    });
    expect(response.decision.suggestion).toMatchObject({
      amountCents: 3150,
      source: "user_provided"
    });
    expect(response.message).toContain("$31.50");
    expect(response.message).toContain("amount you provided");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("refuses to create a savings ledger entry without approval", async () => {
    const agent = createAgent([
      {
        id: "habit_7th_street",
        merchantName: "7th Street",
        userId: "user_123",
        typicalAmountCents: 2746,
        currency: "USD",
        confidence: 0.9
      }
    ]);

    const initialResponse = await agent.respond({
      userId: "user_123",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    const approvalResponse = await agent.approveToolCall(
      {
        userId: "user_123",
        message: "yes save it"
      },
      initialResponse.decision
    );

    expect(approvalResponse.decision.action).toBe("refuse");
    expect(approvalResponse.message).toBe(
      "Savings ledger entries require approval for this exact action."
    );
  });

  it("creates a mocked ledger entry after explicit approval", async () => {
    const agent = createAgent([
      {
        id: "habit_7th_street",
        merchantName: "7th Street",
        userId: "user_123",
        typicalAmountCents: 2746,
        currency: "USD",
        confidence: 0.9
      }
    ]);

    const initialResponse = await agent.respond({
      userId: "user_123",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    const actionId = requireActionId(initialResponse.decision.toolCall?.actionId);

    const approvalResponse = await agent.approveToolCall(
      {
        userId: "user_123",
        message: "yes save it",
        approvedActionId: actionId
      },
      initialResponse.decision
    );

    expect(approvalResponse.decision.action).toBe("create_ledger_entry");
    expect(approvalResponse.message).toBe(
      "Done. I recorded $27.46 in your Victoria savings ledger. Your total in the mocked Victoria savings ledger this week is $27.46. No real money has moved yet."
    );
  });

  it("still confirms a recorded entry if the weekly progress lookup fails", async () => {
    const tools = new MockVictoriaTools();
    vi.spyOn(tools, "getWeeklySavingsTotal").mockRejectedValueOnce(new Error("Ledger summary unavailable."));
    const agent = createAgent([], tools);
    const suggestion = await agent.respond({
      userId: "user_123",
      conversationId: "progress_unavailable",
      message: "I almost bought a $12 pastry but decided to wait."
    });

    const response = await agent.respond({
      userId: "user_123",
      conversationId: "progress_unavailable",
      message: "Yes"
    });

    expect(response.decision.action).toBe("create_ledger_entry");
    expect(response.message).toContain("Done. I recorded $12.00");
    expect(response.message).toContain("couldn't load your weekly total");
    expect(response.message).toContain("No real money has moved yet");
    expect(await tools.listSavingsEntries("user_123")).toHaveLength(1);
    expect(suggestion.decision.proposal?.status).toBe("pending");
  });

  it("refuses an approval id that does not match the pending savings action", async () => {
    const agent = createAgent([
      {
        id: "habit_7th_street",
        merchantName: "7th Street",
        userId: "user_123",
        typicalAmountCents: 2746,
        currency: "USD",
        confidence: 0.9
      }
    ]);

    const initialResponse = await agent.respond({
      userId: "user_123",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    const approvalResponse = await agent.approveToolCall(
      {
        userId: "user_123",
        message: "yes save it",
        approvedActionId: "action_other"
      },
      initialResponse.decision
    );

    expect(approvalResponse.decision.action).toBe("refuse");
    expect(approvalResponse.message).toBe("That approval does not match a pending savings action.");
  });

  it("[APR-002] [APR-005] refuses another user attempting to approve a pending savings action", async () => {
    const agent = createAgent([
      {
        id: "habit_7th_street",
        merchantName: "7th Street",
        userId: "user_123",
        typicalAmountCents: 2746,
        currency: "USD",
        confidence: 0.9
      }
    ]);

    const initialResponse = await agent.respond({
      userId: "user_123",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    const actionId = requireActionId(initialResponse.decision.toolCall?.actionId);

    const approvalResponse = await agent.approveToolCall(
      {
        userId: "user_other",
        message: "yes save it",
        approvedActionId: actionId
      },
      initialResponse.decision
    );

    expect(approvalResponse.decision.action).toBe("refuse");
    expect(approvalResponse.message).toBe("That approval does not match a pending savings action.");
  });

  it("refuses replaying an approval after the pending action is completed", async () => {
    const agent = createAgent([
      {
        id: "habit_7th_street",
        merchantName: "7th Street",
        userId: "user_123",
        typicalAmountCents: 2746,
        currency: "USD",
        confidence: 0.9
      }
    ]);

    const initialResponse = await agent.respond({
      userId: "user_123",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    const actionId = requireActionId(initialResponse.decision.toolCall?.actionId);
    const approvalRequest = {
      userId: "user_123",
      message: "yes save it",
      approvedActionId: actionId
    };

    await agent.approveToolCall(approvalRequest, initialResponse.decision);
    const replayResponse = await agent.approveToolCall(approvalRequest, initialResponse.decision);

    expect(replayResponse.decision.action).toBe("refuse");
    expect(replayResponse.message).toBe("That approval does not match a pending savings action.");
  });

  it("[IDM-002] [IDM-003] [AUD-004] [ERR-003] [ERR-004] retries an uncertain write with the same approval and audit links", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const proposal = await agent.respond({
      userId: "user_123",
      conversationId: "write_failure_retry",
      message: "I almost bought a $12 pastry but decided to wait."
    });
    const actionId = requireActionId(proposal.decision.toolCall?.actionId);
    const createEntry = tools.createSavingsEntry.bind(tools);
    const writeSpy = vi.spyOn(tools, "createSavingsEntry").mockImplementationOnce(async (input) => {
      await createEntry(input);
      throw new Error("Response lost after persistence.");
    });

    const uncertain = await agent.respond({
      userId: "user_123",
      conversationId: "write_failure_retry",
      message: "Yes"
    });
    expect(uncertain.decision.action).toBe("ask_follow_up");
    expect(uncertain.message).toContain("couldn't confirm");
    expect(uncertain.message).toContain("say yes to safely retry");
    expect(uncertain.message).not.toContain("Done. I recorded");
    expect(await tools.listSavingsEntries("user_123")).toHaveLength(1);

    const retried = await agent.respond({
      userId: "user_123",
      conversationId: "write_failure_retry",
      message: "Yes"
    });
    expect(retried.decision.action).toBe("create_ledger_entry");
    expect(retried.decision.proposal).toMatchObject({
      status: "recorded", ledgerEntryId: (await tools.listSavingsEntries("user_123"))[0]?.id
    });
    const entry = (await tools.listSavingsEntries("user_123"))[0];
    expect(entry).toMatchObject({
      userId: "user_123",
      proposalId: proposal.decision.proposal?.id,
      approvedActionId: actionId,
      approvalId: retried.decision.proposal?.status === "recorded"
        ? retried.decision.proposal.approval.id
        : undefined
    });
    expect(writeSpy.mock.calls).toHaveLength(2);
    expect(writeSpy.mock.calls[1]?.[0].approvalId).toBe(writeSpy.mock.calls[0]?.[0].approvalId);
    expect(retried.decision.proposalTransitions?.at(-1)).toMatchObject({
      proposalId: proposal.decision.proposal?.id,
      actionId,
      userId: "user_123",
      approvalId: entry?.approvalId,
      ledgerEntryId: entry?.id
    });
  });

  it("keeps a proposal retryable when the ledger write fails before saving", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    await agent.respond({
      userId: "user_123",
      conversationId: "write_failure_before_save",
      message: "I almost bought a $12 pastry but decided to wait."
    });
    vi.spyOn(tools, "createSavingsEntry").mockRejectedValueOnce(new Error("Ledger unavailable."));

    const failed = await agent.respond({
      userId: "user_123",
      conversationId: "write_failure_before_save",
      message: "Yes"
    });
    expect(failed.decision.action).toBe("ask_follow_up");
    expect(failed.message).toContain("haven't marked this action complete");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const retried = await agent.respond({
      userId: "user_123",
      conversationId: "write_failure_before_save",
      message: "Yes"
    });
    expect(retried.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries("user_123")).toHaveLength(1);
  });

  it("asks about a vague savings moment and continues after the user gives context", async () => {
    const tools = new MockVictoriaTools([
      {
        id: "habit_7th_street",
        merchantName: "7th Street",
        userId: "user_123",
        typicalAmountCents: 2746,
        currency: "USD",
        confidence: 0.9
      }
    ]);
    const agent = createAgent(
      [
        {
          id: "habit_7th_street",
          merchantName: "7th Street",
          userId: "user_123",
          typicalAmountCents: 2746,
          currency: "USD",
          confidence: 0.9
        }
      ],
      tools
    );
    const context = { userId: "user_123", conversationId: "conversation_123" };

    const response = await agent.respond({
      ...context,
      message: "I saved money today."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.classification.type).toBe("unclear");
    expect(response.decision.savingsEvent).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(response.message).toContain("What did you avoid spending on");
    expect(response.message).toContain("about how much");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const followUp = await agent.respond({
      ...context,
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });

    expect(followUp.decision.action).toBe("suggest_savings");
    expect(followUp.decision.proposal?.status).toBe("pending");
    expect(followUp.decision.suggestion?.amountCents).toBe(2746);
    expect(followUp.decision.toolCall?.requiresApproval).toBe(true);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("asks for an unknown avoided-spend amount and uses the user's answer", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "conversation_123" };

    const clarification = await agent.respond({
      ...context,
      message: "I cooked instead of ordering takeout."
    });

    expect(clarification.decision.action).toBe("ask_follow_up");
    expect(clarification.decision.classification.type).toBe("avoided_spend");
    expect(clarification.decision.savingsEvent).toMatchObject({
      id: "event_1",
      type: "avoided_spend"
    });
    expect(clarification.decision.savingsEvent?.userProvidedAmountCents).toBeUndefined();
    expect(clarification.decision.proposal).toBeUndefined();
    expect(clarification.decision.toolCall).toBeUndefined();
    expect(clarification.message).toContain("About how much");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const suggestion = await agent.respond({ ...context, message: "About $18." });

    expect(suggestion.decision.action).toBe("suggest_savings");
    expect(suggestion.decision.savingsEvent?.id).toBe(clarification.decision.savingsEvent?.id);
    expect(suggestion.decision.proposal?.status).toBe("pending");
    expect(suggestion.decision.suggestion).toMatchObject({
      amountCents: 1800,
      source: "user_provided"
    });
    expect(suggestion.decision.toolCall?.requiresApproval).toBe(true);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("resolves a bare amount against the pending amount question before model intent classification", async () => {
    const tools = new MockVictoriaTools();
    const memory = new MockMemoryProvider();
    const llm = new MockLlmAdapter();
    const baseLlm = new MockLlmAdapter();
    const classify = vi.spyOn(llm, "classifyMessage");
    const baseClassify = baseLlm.classifyMessage.bind(baseLlm);
    classify.mockImplementation(async (input) => input.userMessage.trim() === "$35"
      ? { type: "entry_correction", confidence: 0.99, amountCents: 3500, summary: input.userMessage, needsClarification: false }
      : baseClassify(input));
    const agent = new VictoriaAgent({ llm, memory, tools });
    const context = { userId: "user_123", conversationId: "amount_reply_context" };

    const question = await agent.respond({ ...context, message: "I cooked instead of ordering takeout." });
    expect(question.decision.action).toBe("ask_follow_up");

    const answer = await agent.respond({ ...context, message: "$35" });
    expect(answer.decision.classification.type).toBe("avoided_spend");
    expect(answer.decision.action).toBe("suggest_savings");
    expect(answer.decision.suggestion?.amountCents).toBe(3500);
    expect(answer.decision.toolCall?.requiresApproval).toBe(true);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("responds without shame or savings action for regretful spending", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);

    const response = await agent.respond({
      userId: "user_123",
      message: "I regret spending $42 on takeout last night."
    });

    expect(response.decision.action).toBe("reflect");
    expect(response.message).toContain("No shame");
    expect(response.decision.savingsEvent).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("answers a low-cost meal question in a regretful-spend turn without reopening savings", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const responder = vi.fn(async (input: ConversationResponderInput) =>
      input.message.includes("low-cost dinner")
        ? "A one-pot lentil soup is easy to cook together and uses pantry staples."
        : "I can help with that.");
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      conversationResponder: { respond: responder },
      specialists: { ...base, financialMoment: { analyze: async ({ message }) => ({ classification: {
        type: "regretful_spend", confidence: 0.95, amountCents: 4_200,
        summary: message, needsClarification: false
      } }) } }
    });
    const request = { userId: "regretful_mixed_user", conversationId: "regretful_mixed_chat" };

    const response = await agent.respond({ ...request,
      message: "I regret spending $42 on takeout last night. I'm feeling bad about it. Could you suggest a low-cost dinner to make with friends this Sunday? I'm not sure I want to put the $42 in the ledger." });

    expect(response.decision.action).toBe("reflect");
    expect(response.message).toContain("No shame");
    expect(response.message).toContain("lentil soup");
    expect(response.message).not.toMatch(/record.*\$42|\$42.*record/i);
    expect(response.decision.savingsEvent).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(responder).toHaveBeenCalledOnce();
    expect(responder.mock.calls[0]?.[0].message).toBe("Could you suggest a low-cost dinner to make with friends this Sunday?");
    expect(await tools.listSavingsEntries(request.userId)).toEqual([]);
  });

  it("uses specialist advice only when it agrees with the deterministic estimate", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const specialists: AgentTeamSpecialists = {
      ...base,
      savingsReasoning: {
        assess: async ({ finding }) => finding.classification.amountCents === undefined
          ? { outcome: "ask", confidence: 0.95, question: "Which amount should I use?" }
          : {
              outcome: "suggest",
              confidence: 0.95,
              amountCents: finding.classification.amountCents + 100,
              source: "user_provided",
              rationale: "Deliberately mismatched test advice."
            }
      }
    };
    const agent = createAgent([], tools, specialists);
    const response = await agent.respond({
      userId: "user_123",
      message: "I almost bought a $20 book but decided to wait."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("builds grounded recurring-cost context for Savings Reasoning without exposing unrelated turns", async () => {
    const tools = new MockVictoriaTools();
    const memory = new MockMemoryProvider();
    const request = { userId: "context_builder_user", conversationId: "context_builder_chat" };
    await memory.setConversationContext(request.userId, request.conversationId, [
      "My employer now covers the $35/month gym where I play basketball.",
      "Victoria: Which planning target do you prefer?",
      "I am also thinking about a weekend trip to see my sister."
    ]);
    const base = createMockAgentTeamSpecialists();
    const analyze = vi.fn((input) => base.financialMoment.analyze(input));
    const assess = vi.fn((input) => base.savingsReasoning.assess(input));
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools,
      specialists: { ...base, financialMoment: { analyze }, savingsReasoning: { assess } }
    });

    await agent.respond({ ...request, message: "I almost bought a $20 book but decided to wait." });

    expect(analyze).toHaveBeenCalledWith(expect.objectContaining({
      financialContext: expect.objectContaining({
        financialFacts: expect.arrayContaining([
          expect.objectContaining({ amountCents: 3_500, period: "monthly" }),
          expect.objectContaining({ amountCents: 42_000, period: "annual", provenance: "derived" })
        ])
      })
    }));
    expect(assess).toHaveBeenCalledWith(expect.objectContaining({
      financialContext: expect.objectContaining({
        relevantUserTurns: [{
          sourceTurnIndex: 0,
          text: "My employer now covers the $35/month gym where I play basketball."
        }],
        financialFacts: expect.arrayContaining([
          expect.objectContaining({ amountCents: 3_500, period: "monthly", provenance: "user_statement" }),
          expect.objectContaining({ amountCents: 42_000, period: "annual", provenance: "derived" })
        ])
      })
    }));
    expect(assess.mock.calls[0]?.[0].financialContext?.relevantUserTurns)
      .not.toEqual(expect.arrayContaining([expect.objectContaining({ text: expect.stringContaining("weekend trip") })]));
  });

  it("runs the specialist team for an avoided-spend turn, but approval still bypasses the team", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const specialists: AgentTeamSpecialists = {
      financialMoment: { analyze: vi.fn((input) => base.financialMoment.analyze(input)) },
      savingsReasoning: { assess: vi.fn((input) => base.savingsReasoning.assess(input)) },
      companionVoice: { respond: vi.fn((input) => base.companionVoice.respond(input)) }
    };
    const agent = createAgent([], tools, specialists);
    const context = { userId: "user_123", conversationId: "specialist_core_flow" };
    const proposed = await agent.respond({ ...context, message: "I almost bought a $20 book but waited." });

    expect(specialists.financialMoment.analyze).toHaveBeenCalledTimes(1);
    expect(specialists.savingsReasoning.assess).toHaveBeenCalledTimes(1);
    expect(specialists.companionVoice.respond).toHaveBeenCalledTimes(1);
    expect(proposed.decision.action).toBe("suggest_savings");
    expect(proposed.decision.suggestion?.amountCents).toBe(2000);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const recorded = await agent.respond({ ...context, message: "Yes" });
    expect(recorded.decision.action).toBe("create_ledger_entry");
    expect(specialists.financialMoment.analyze).toHaveBeenCalledTimes(1);
    expect(await tools.listSavingsEntries("user_123")).toHaveLength(1);
  });

  it("carries a vague avoided-spend moment through amount clarification, proposal, and approval", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const specialists: AgentTeamSpecialists = {
      financialMoment: { analyze: vi.fn((input) => base.financialMoment.analyze(input)) },
      savingsReasoning: { assess: vi.fn((input) => base.savingsReasoning.assess(input)) },
      companionVoice: { respond: vi.fn((input) => base.companionVoice.respond(input)) }
    };
    const agent = createAgent([], tools, specialists);
    const context = { userId: "user_123", conversationId: "multi_turn_specialists" };

    const first = await agent.respond({ ...context, message: "I cooked instead of ordering takeout." });
    expect(first.decision.action).toBe("ask_follow_up");
    expect(first.decision.savingsEvent).toBeDefined();
    expect(first.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const amount = await agent.respond({ ...context, message: "About $18." });
    expect(amount.decision.action).toBe("suggest_savings");
    expect(amount.decision.savingsEvent?.id).toBe(first.decision.savingsEvent?.id);
    expect(amount.decision.suggestion?.amountCents).toBe(1800);
    expect(amount.decision.proposal?.status).toBe("pending");
    expect(amount.decision.toolCall?.requiresApproval).toBe(true);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const approval = await agent.respond({ ...context, message: "Yes" });
    expect(approval.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([{ amountCents: 1800 }]);
    expect(specialists.financialMoment.analyze).toHaveBeenCalledTimes(1);
    expect(specialists.savingsReasoning.assess).toHaveBeenCalledTimes(1);
    expect(specialists.companionVoice.respond).not.toHaveBeenCalled();
  });

  it("asks when specialist habit reasoning disagrees with the core estimator", async () => {
    const userHabit: UserHabit = {
      id: "habit_blue_bottle", userId: "user_123", merchantName: "Blue Bottle",
      typicalAmountCents: 675, currency: "USD", confidence: 0.9
    };
    const tools = new MockVictoriaTools([{
      ...userHabit,
      typicalAmountCents: 725
    }]);
    const specialists = createMockAgentTeamSpecialists();
    const agent = createAgent([userHabit], tools, specialists);
    const context = { userId: "user_123", conversationId: "estimate_disagreement" };
    const response = await agent.respond({
      ...context,
      message: "I made coffee at home instead of going to Blue Bottle."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const clarified = await agent.respond({ ...context, message: "About $7.25." });
    expect(clarified.decision.action).toBe("suggest_savings");
    expect(clarified.decision.suggestion?.amountCents).toBe(725);
    expect(clarified.decision.savingsEvent?.id).toBe(response.decision.savingsEvent?.id);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const recorded = await agent.respond({ ...context, message: "Yes" });
    expect(recorded.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([{ amountCents: 725 }]);
  });

  it("[ARC-005] turns low-confidence classification into a clarification and resumes after clearer context", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    let classificationCount = 0;
    const analyzedMessages: Array<{ message: string; context?: readonly string[] }> = [];
    const specialists: AgentTeamSpecialists = {
      ...base,
      savingsReasoning: { assess: vi.fn((input) => base.savingsReasoning.assess(input)) },
      companionVoice: { respond: vi.fn((input) => base.companionVoice.respond(input)) },
      financialMoment: {
        analyze: vi.fn(async (input) => {
          const { message } = input;
          classificationCount += 1;
          analyzedMessages.push({ message, context: input.conversationContext });
          return {
            classification: {
              type: "avoided_spend" as const,
              confidence: classificationCount === 1 ? 0.55 : 0.95,
              ...(classificationCount >= 3 ? { amountCents: 2000 } : {}),
              summary: message,
              needsClarification: false
            }
          };
        })
      }
    };
    const agent = createAgent([], tools, specialists);
    const context = { userId: "user_123", conversationId: "low_confidence_follow_up" };

    const uncertain = await agent.respond({ ...context, message: "I almost bought a $20 book, but I'm not sure." });
    expect(uncertain.decision.action).toBe("ask_follow_up");
    expect(uncertain.decision.classification.type).toBe("unclear");
    expect(uncertain.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const clarified = await agent.respond({ ...context, message: "Yes, I did." });
    expect(analyzedMessages[1]?.message).toBe("Yes, I did.");
    expect(analyzedMessages[1]?.context).toContain("I almost bought a $20 book, but I'm not sure.");
    expect(clarified.decision.action).toBe("ask_follow_up");
    expect(clarified.decision.suggestion).toBeUndefined();

    const amount = await agent.respond({ ...context, message: "$20" });
    expect(amount.decision.action).toBe("suggest_savings");
    expect(amount.decision.suggestion?.amountCents).toBe(2000);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const recorded = await agent.respond({ ...context, message: "Yes" });
    expect(recorded.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([{ amountCents: 2000 }]);
  });

  it("clears pending clarification context when the user switches to a clear question", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    let firstCall = true;
    const specialists: AgentTeamSpecialists = {
      ...base,
      savingsReasoning: { assess: vi.fn((input) => base.savingsReasoning.assess(input)) },
      companionVoice: { respond: vi.fn((input) => base.companionVoice.respond(input)) },
      financialMoment: {
        analyze: vi.fn(async (input) => {
          if (firstCall) {
            firstCall = false;
            return { classification: {
              type: "avoided_spend" as const, confidence: 0.55, amountCents: 2000,
              summary: input.message, needsClarification: false
            } };
          }
          return base.financialMoment.analyze(input);
        })
      }
    };
    const agent = createAgent([], tools, specialists);
    const context = { userId: "user_123", conversationId: "switch_from_uncertain_intent" };

    const uncertain = await agent.respond({ ...context, message: "I might have skipped a purchase." });
    expect(uncertain.decision.action).toBe("ask_follow_up");
    const progress = await agent.respond({ ...context, message: "How much have I saved this week?" });

    expect(progress.decision.action).toBe("summarize_progress");
    expect(progress.message).toContain("No savings have been recorded");
    expect(specialists.savingsReasoning.assess).not.toHaveBeenCalled();
    expect(specialists.companionVoice.respond).not.toHaveBeenCalled();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("falls back to clarification when Financial Moment classification fails", async () => {
    const base = createMockAgentTeamSpecialists();
    const specialists: AgentTeamSpecialists = {
      ...base,
      financialMoment: { analyze: vi.fn(async () => { throw new Error("specialist unavailable"); }) },
      savingsReasoning: { assess: vi.fn((input) => base.savingsReasoning.assess(input)) },
      companionVoice: { respond: vi.fn((input) => base.companionVoice.respond(input)) }
    };
    const tools = new MockVictoriaTools();
    const response = await createAgent([], tools, specialists).respond({
      userId: "user_123", message: "I almost bought a $20 book but waited."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.classification.type).toBe("unclear");
    expect(response.decision.proposal).toBeUndefined();
    expect(specialists.savingsReasoning.assess).not.toHaveBeenCalled();
    expect(specialists.companionVoice.respond).not.toHaveBeenCalled();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("asks after Savings Reasoning fails and restores safe wording when Companion Voice fails", async () => {
    const base = createMockAgentTeamSpecialists();
    const savingsFailure: AgentTeamSpecialists = {
      ...base,
      savingsReasoning: { assess: vi.fn(async () => { throw new Error("reasoning unavailable"); }) }
    };
    const askTools = new MockVictoriaTools();
    const asked = await createAgent([], askTools, savingsFailure).respond({
      userId: "user_123", message: "I almost bought a $20 book but waited."
    });
    expect(asked.decision.action).toBe("ask_follow_up");
    expect(asked.decision.proposal).toBeUndefined();
    expect(await askTools.listSavingsEntries("user_123")).toEqual([]);

    const voiceFailure: AgentTeamSpecialists = {
      ...base,
      companionVoice: { respond: vi.fn(async () => { throw new Error("voice unavailable"); }) }
    };
    const proposalTools = new MockVictoriaTools();
    const proposed = await createAgent([], proposalTools, voiceFailure).respond({
      userId: "user_123", message: "I almost bought a $20 book but waited."
    });
    expect(proposed.decision.action).toBe("suggest_savings");
    expect(proposed.message).toContain("Please confirm");
    expect(proposed.message).toContain("No real money has moved");
    expect(await proposalTools.listSavingsEntries("user_123")).toEqual([]);
  });

  it.each([
    { message: "How much have I saved this week?", action: "summarize_progress" },
    { message: "Put this toward my emergency fund.", action: "update_goal" },
    { message: "Correct the recorded amount to $24.", action: "ask_follow_up" }
  ] as const)("routes core behavior for '$message' without invoking unrelated specialists", async ({ message, action }) => {
    const base = createMockAgentTeamSpecialists();
    const specialists: AgentTeamSpecialists = {
      financialMoment: { analyze: vi.fn((input) => base.financialMoment.analyze(input)) },
      savingsReasoning: { assess: vi.fn((input) => base.savingsReasoning.assess(input)) },
      companionVoice: { respond: vi.fn((input) => base.companionVoice.respond(input)) }
    };
    const response = await createAgent([], new MockVictoriaTools(), specialists).respond({
      userId: "user_123", message
    });

    expect(response.decision.action).toBe(action);
    expect(specialists.financialMoment.analyze).toHaveBeenCalledTimes(1);
    expect(specialists.savingsReasoning.assess).not.toHaveBeenCalled();
    expect(specialists.companionVoice.respond).not.toHaveBeenCalled();
  });
});

function createAgent(
  habits: UserHabit[] = [],
  tools: MockVictoriaTools = new MockVictoriaTools(habits),
  specialists?: AgentTeamSpecialists
): VictoriaAgent {
  return new VictoriaAgent({
    llm: new MockLlmAdapter(),
    memory: new MockMemoryProvider(habits),
    tools,
    ...(specialists ? { specialists } : {})
  });
}

function requireActionId(actionId: string | undefined): string {
  if (!actionId) {
    throw new Error("Expected a pending action id.");
  }

  return actionId;
}

function savingsEntry(
  overrides: Partial<SavingsEntry> & Pick<SavingsEntry, "id" | "userId" | "amountCents" | "createdAt">
): SavingsEntry {
  return {
    eventId: "event_seed",
    proposalId: "proposal_seed",
    approvalId: "approval_seed",
    approvedActionId: "action_seed",
    currency: "USD",
    reason: "Seeded test entry",
    movementMode: "mock_ledger",
    status: "completed",
    ...overrides
  };
}
