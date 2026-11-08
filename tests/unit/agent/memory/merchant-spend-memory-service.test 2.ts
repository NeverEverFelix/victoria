import { describe, expect, it } from "vitest";
import { MerchantSpendMemoryService } from "../../../../src/agent/memory/merchant-spend-memory-service.js";
import { MockMemoryProvider } from "../../../../src/agent/memory/mock-memory.js";

const request = {
  userId: "merchant-memory-user",
  conversationId: "merchant-memory-chat",
  message: "Usually $18.50 at the cafe.",
  sourceTurnReferences: [{ turnId: "merchant_turn_1", userMessage: "Usually $18.50 at the cafe." }]
};

describe("MerchantSpendMemoryService", () => {
  it("stores a positive user-reported amount with turn provenance and recalls cents", async () => {
    const memory = new MockMemoryProvider();
    const service = new MerchantSpendMemoryService(memory);

    await service.rememberTypicalSpend(request, "Blue Cafe", 1850, request.message);

    expect(await service.findTypicalSpend(request.userId, "Blue Cafe")).toBe(1850);
    expect(await memory.listConversationalMemories(request.userId)).toMatchObject([{
      key: "merchant_spend:blue_cafe",
      value: "Usually spends $18.50 at Blue Cafe.",
      sourceMetadata: { sourceTurnReferences: [{ turnId: "merchant_turn_1" }] }
    }]);
  });

  it("ignores non-positive or unsafe amounts", async () => {
    const memory = new MockMemoryProvider();
    const service = new MerchantSpendMemoryService(memory);

    await service.rememberTypicalSpend(request, "Blue Cafe", 0, request.message);
    await service.rememberTypicalSpend(request, "Blue Cafe", Number.MAX_SAFE_INTEGER + 1, request.message);

    expect(await memory.listConversationalMemories(request.userId)).toHaveLength(0);
  });

  it("links a changed estimate to its prior record and avoids duplicate retries", async () => {
    const memory = new MockMemoryProvider();
    const service = new MerchantSpendMemoryService(memory);
    await service.rememberTypicalSpend(request, "Blue Cafe", 1850, request.message);
    await service.rememberTypicalSpend(request, "Blue Cafe", 1850, request.message);
    const prior = (await memory.listConversationalMemories(request.userId))[0];

    await service.rememberTypicalSpend({
      ...request,
      message: "Actually usually $21.00 at the cafe.",
      sourceTurnReferences: [{ turnId: "merchant_turn_2", userMessage: "Actually usually $21.00 at the cafe." }]
    }, "Blue Cafe", 2100, "Actually usually $21.00 at the cafe.");

    const history = await memory.listConversationalMemories(request.userId);
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({
      value: "Usually spends $21.00 at Blue Cafe.",
      supersedesId: prior?.id,
      sourceMetadata: { sourceTurnReferences: [{ turnId: "merchant_turn_2" }] }
    });
  });

  it("returns evidence for a matching saved merchant habit", async () => {
    const memory = new MockMemoryProvider();
    const service = new MerchantSpendMemoryService(memory);
    await memory.rememberConversationalMemory(request.userId, {
      category: "habit", key: "merchant_habit:blue_cafe", value: "Visits Blue Cafe on Saturdays.",
      evidence: "I usually go there on Saturdays.", confidence: 0.9
    });

    expect(await service.findHabitEvidence(request.userId, "Blue Cafe")).toBe("I usually go there on Saturdays.");
  });
});
