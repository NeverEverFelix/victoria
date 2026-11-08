import { describe, expect, it } from "vitest";
import { ConversationMemoryCaptureService } from "../../../src/agent/conversation-memory-capture-service.js";
import { MockMemoryProvider } from "../../../src/agent/memory/mock-memory.js";

describe("ConversationMemoryCaptureService", () => {
  it("stores a validated direct fact with the exact source turn and returns its acknowledgement", async () => {
    const memory = new MockMemoryProvider();
    const service = new ConversationMemoryCaptureService({ memory });
    const request = {
      userId: "capture-user", conversationId: "capture-chat",
      message: "I prefer saving $20 rather than $50 at a time.",
      sourceTurnReferences: [{ turnId: "turn-1", userMessage: "I prefer saving $20 rather than $50 at a time." }]
    };

    const result = await service.capture({ request });

    expect(result.acknowledgement).toContain("I'll remember");
    expect(result.isMixedFinancialTurn).toBe(false);
    expect(await memory.listConversationalMemories("capture-user")).toEqual(expect.arrayContaining([
      expect.objectContaining({
        key: "savings_contribution_amount",
        sourceMetadata: expect.objectContaining({ sourceTurnReferences: [{ turnId: "turn-1" }] })
      })
    ]));
  });

  it("captures an explicitly stated interest during covered-spend context without replacing the financial reply", async () => {
    const memory = new MockMemoryProvider();
    const service = new ConversationMemoryCaptureService({ memory });
    const request = {
      userId: "capture-interest-user",
      message: "Hey, I like to play basketball at this gym that costs me $35 a month, but now my company pays for my gym membership. Is it a good idea to move this money elsewhere?"
    };

    const result = await service.capture({ request });

    expect(result.interestSavedThisTurn).toBe(true);
    expect(result.acknowledgement).toBeUndefined();
    expect(await memory.listConversationalMemories("capture-interest-user")).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "interest:basketball", value: "Enjoys basketball." })
    ]));
  });

  it("does not store quoted or third-party statements as user memory", async () => {
    const memory = new MockMemoryProvider();
    const service = new ConversationMemoryCaptureService({ memory });

    const result = await service.capture({ request: {
      userId: "capture-quoted-user", message: "My friend said, 'I love hiking.'"
    } });

    expect(result.acknowledgement).toBeUndefined();
    expect(await memory.listConversationalMemories("capture-quoted-user")).toEqual([]);
  });
});
