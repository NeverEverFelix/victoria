import { describe, expect, it } from "vitest";
import { MockLlmAdapter, MockMemoryProvider, MockVictoriaTools, VictoriaAgent } from "../../../src/agent/index.js";

describe("explicit savings preference memory", () => {
  it("keeps a pending savings approval visible when a separate preference is stated", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });

    const proposal = await agent.respond({
      userId: "user_pref_pending", conversationId: "chat_pref_pending",
      message: "I almost bought a $30 book but decided to wait."
    });
    expect(proposal.decision.action).toBe("suggest_savings");

    const preference = await agent.respond({
      userId: "user_pref_pending", conversationId: "chat_pref_pending",
      message: "I prefer saving $20 rather than $50 at a time."
    });
    expect(preference.decision.action).toBe("ask_follow_up");
    expect(preference.message).toContain("clear yes or no about the pending savings entry");
    expect(await memory.listConversationalMemories("user_pref_pending")).toHaveLength(1);

    const recorded = await agent.respond({
      userId: "user_pref_pending", conversationId: "chat_pref_pending", message: "Yes"
    });
    expect(recorded.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries("user_pref_pending")).toHaveLength(1);
  });

  it("[MEM-002] remembers an explicit preferred amount without suggesting or recording savings", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });

    const response = await agent.respond({
      userId: "user_pref", conversationId: "chat_pref",
      message: "I prefer saving $20 rather than $50 at a time."
    });

    expect(response.decision.action).toBe("reflect");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries("user_pref")).toEqual([]);
    expect(await memory.listConversationalMemories("user_pref")).toMatchObject([{
      category: "preference",
      key: "savings_contribution_amount",
      value: "Prefers saving $20.00 rather than $50.00 at a time.",
      evidence: "I prefer saving $20 rather than $50 at a time.",
      confidence: 1
    }]);
  });

  it("[MEM-002] does not store tentative, equal, or malformed amount comparisons as preferences", async () => {
    const memory = new MockMemoryProvider();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools() });

    await agent.respond({ userId: "user_pref", message: "Maybe I should save $20 rather than $50?" });
    await agent.respond({ userId: "user_pref", message: "I prefer saving $20 rather than $20." });
    await agent.respond({ userId: "user_pref", message: "I prefer saving $20.999 rather than $50." });

    expect(await memory.listConversationalMemories("user_pref")).toEqual([]);
  });

  it("[MEM-003] appends a changed preference linked to the prior preference and keeps users separate", async () => {
    const memory = new MockMemoryProvider();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools() });
    const userId = "user_pref";
    await agent.respond({ userId, message: "I prefer saving $20 rather than $50 at a time." });
    await agent.respond({ userId, message: "Actually, I prefer saving $25 rather than $50 at a time." });

    const facts = await memory.listConversationalMemories(userId);
    expect(facts).toHaveLength(2);
    expect(facts[1]).toMatchObject({
      key: "savings_contribution_amount",
      value: "Prefers saving $25.00 rather than $50.00 at a time.",
      supersedesId: facts[0]?.id
    });
    expect(await memory.listConversationalMemories("another_user")).toEqual([]);
  });
});

describe("general conversational memory extraction", () => {
  it("[MEM-002] remembers explicit preferences, recurring habits, and stated goals without financial actions", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });
    const userId = "user_general_memory";

    await agent.respond({ userId, message: "I prefer a short weekly savings goal." });
    await agent.respond({ userId, message: "I usually make coffee at home on weekdays." });
    await agent.respond({ userId, message: "My goal is to save $1,000 for a trip to Japan." });

    const facts = await memory.listConversationalMemories(userId);
    expect(facts.map((fact) => fact.category)).toEqual(["preference", "habit", "goal"]);
    expect(facts.every((fact) => fact.evidence.length > 0 && fact.confidence > 0)).toBe(true);
    expect(facts[1]?.value.toLowerCase()).toContain("coffee at home");
    expect(facts[2]?.value.toLowerCase()).toContain("trip to japan");
    expect(await tools.listSavingsEntries(userId)).toEqual([]);
    expect(await tools.listSavingsGoalAllocations(userId)).toEqual([]);
  });

  it("[MEM-002] ignores tentative habits, preferences, and goals", async () => {
    const memory = new MockMemoryProvider();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools() });
    const userId = "user_uncertain_memory";

    await agent.respond({ userId, message: "Maybe I should make coffee at home more often." });
    await agent.respond({ userId, message: "I might prefer smaller weekly goals." });
    await agent.respond({ userId, message: "I could save for a trip someday." });

    expect(await memory.listConversationalMemories(userId)).toEqual([]);
  });

  it("[MEM-003] avoids duplicate facts and links a changed fact on the same topic", async () => {
    const memory = new MockMemoryProvider();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools() });
    const userId = "user_memory_update";

    await agent.respond({ userId, message: "I prefer a short weekly savings goal." });
    await agent.respond({ userId, message: "I prefer a short weekly savings goal." });
    await agent.respond({ userId, message: "I prefer a flexible weekly savings goal." });

    const facts = await memory.listConversationalMemories(userId);
    expect(facts).toHaveLength(2);
    expect(facts[1]?.supersedesId).toBe(facts[0]?.id);
  });

  it("[MEM-003] links a revised goal amount to the goal for the same destination", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });
    const userId = "user_goal_memory";

    await agent.respond({ userId, message: "My goal is to save $1,000 for a trip to Japan." });
    await agent.respond({ userId, message: "My goal is to save $1,500 for a trip to Japan." });

    const facts = await memory.listConversationalMemories(userId);
    expect(facts).toHaveLength(2);
    expect(facts[1]?.supersedesId).toBe(facts[0]?.id);
    expect(await tools.listSavingsGoalAllocations(userId)).toEqual([]);
  });
});
