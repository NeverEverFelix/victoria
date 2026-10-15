import { describe, expect, it } from "vitest";
import { MockMemoryProvider } from "../../../src/agent/memory/mock-memory.js";
import { MemoryOrchestrator } from "../../../src/agent/memory/memory-orchestrator.js";
import { MockLlmAdapter } from "../../../src/agent/llm/mock-llm.js";
import { MockVictoriaTools } from "../../../src/agent/tools/mock-tools.js";
import { VictoriaAgent } from "../../../src/agent/victoria-agent.js";

describe("conversational financial corrections", () => {
  it("appends a single-day correction linked to the relevant profile fact without rewriting the aggregate", async () => {
    const storage = new MockMemoryProvider();
    const profile = await storage.rememberConversationalMemory("user-a", {
      category: "financial_pattern",
      key: "financial_profile:merchant:blue_bottle",
      value: "Typical spend at Blue Bottle is $27.00.",
      evidence: "Derived from posted transactions.",
      confidence: 0.8,
      sourceType: "plaid_transaction_profile",
      observedThrough: "2026-10-13",
      sourceMetadata: { profileStatus: "active" }
    });
    await storage.setConversationContext("user-a", "conversation-a", [
      "Victoria: Your linked transaction history shows about $27 at Blue Bottle that day."
    ]);
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory: storage, tools });

    const response = await agent.respond({
      userId: "user-a",
      conversationId: "conversation-a",
      message: "No, that's not right. I actually spent $40 that day."
    });

    expect(response.decision.action).toBe("reflect");
    expect(response.message).toContain("spent $40.00 on that day");
    expect(await tools.listSavingsEntries("user-a")).toEqual([]);
    const history = await storage.listConversationalMemories("user-a");
    expect(history).toHaveLength(2);
    expect(history[0]).toEqual(profile);
    expect(history[1]).toMatchObject({
      category: "financial_pattern",
      key: "transaction_correction:financial_profile:merchant:blue_bottle:that_day",
      value: "User reports spending $40.00 on that day.",
      sourceType: "user_correction",
      sourceMetadata: { correctionOfMemoryId: profile.id, correctionScope: "individual_transaction" }
    });

    const recalled = await new MemoryOrchestrator(storage).getMemoryForUser("user-a", "Blue Bottle that day");
    expect(recalled.conversationalMemories?.some((item) => item.sourceType === "user_correction")).toBe(true);
  });

  it("asks which purchase the user means when recent context does not identify one memory", async () => {
    const storage = new MockMemoryProvider();
    await storage.rememberConversationalMemory("user-a", {
      category: "financial_pattern", key: "financial_profile:merchant:blue_bottle",
      value: "Typical spend at Blue Bottle is $27.00.", evidence: "Linked transaction history.", confidence: 0.8,
      sourceType: "plaid_transaction_profile", observedThrough: "2026-10-13"
    });
    await storage.rememberConversationalMemory("user-a", {
      category: "financial_pattern", key: "financial_profile:merchant:corner_market",
      value: "Typical spend at Corner Market is $27.00.", evidence: "Linked transaction history.", confidence: 0.8,
      sourceType: "plaid_transaction_profile", observedThrough: "2026-10-13"
    });
    await storage.setConversationContext("user-a", "conversation-a", [
      "Victoria: Your recent spending history includes several purchases that day."
    ]);
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory: storage, tools: new MockVictoriaTools() });

    const response = await agent.respond({
      userId: "user-a", conversationId: "conversation-a",
      message: "No, I actually spent $40 that day."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.message).toContain("Which purchase or day");
    expect(await storage.listConversationalMemories("user-a")).toHaveLength(2);
  });
});
