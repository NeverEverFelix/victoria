import { describe, expect, it } from "vitest";
import { MockMemoryProvider } from "../../../src/agent/memory/mock-memory.js";
import { MemoryOrchestrator } from "../../../src/agent/memory/memory-orchestrator.js";
import { correctRememberedSpendFromConversation } from "../../../src/agent/memory/memory-correction-service.js";

describe("correctRememberedSpendFromConversation", () => {
  it("appends an immutable correction when one prior financial memory is identified", async () => {
    const memory = new MemoryOrchestrator(new MockMemoryProvider());
    const prior = await memory.rememberConversationalMemory("correction-service-user", {
      category: "habit", key: "merchant_spend:starbucks", value: "Usually spends around $8 at Starbucks.",
      evidence: "The user described their usual coffee purchase.", confidence: 0.9, sourceType: "user_statement"
    });

    const result = await correctRememberedSpendFromConversation({
      request: { userId: "correction-service-user", message: "Actually that Starbucks was $11." },
      conversationContext: ["Victoria: Your Starbucks spending is usually around $8."],
      correction: { amountCents: 1_100, scopeText: "Starbucks" },
      memory
    });

    expect(result.decision.action).toBe("reflect");
    expect(result.message).toContain("spent $11.00 on Starbucks");
    expect(result.message).toContain("haven't changed or recorded any money");
    const memories = await memory.listConversationalMemories("correction-service-user");
    expect(memories).toHaveLength(2);
    expect(memories.find(({ key }) => key.startsWith("transaction_correction:"))).toMatchObject({
      category: "financial_pattern", key: expect.stringContaining("transaction_correction:"),
      sourceType: "user_correction",
      sourceMetadata: { correctionOfMemoryId: prior.id, correctionScope: "individual_transaction" }
    });
  });

  it("asks which purchase when multiple memories match equally and writes nothing", async () => {
    const memory = new MemoryOrchestrator(new MockMemoryProvider());
    await memory.rememberConversationalMemory("ambiguous-correction-user", {
      category: "financial_pattern", key: "starbucks_spend", value: "Starbucks spending near $8.",
      evidence: "User described Starbucks spending.", confidence: 0.9
    });
    await memory.rememberConversationalMemory("ambiguous-correction-user", {
      category: "habit", key: "merchant_spend:starbucks", value: "Starbucks spending near $9.",
      evidence: "User described Starbucks spending.", confidence: 0.9
    });

    const result = await correctRememberedSpendFromConversation({
      request: { userId: "ambiguous-correction-user", message: "Actually that Starbucks was $11." },
      conversationContext: ["Victoria: Your Starbucks spending is usually around $8."],
      correction: { amountCents: 1_100, scopeText: "Starbucks" },
      memory
    });

    expect(result.decision.action).toBe("ask_follow_up");
    expect(result.message).toContain("Which purchase or day");
    expect(await memory.listConversationalMemories("ambiguous-correction-user")).toHaveLength(2);
  });
});
