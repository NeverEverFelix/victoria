import { describe, expect, it } from "vitest";
import { CoveredExpenseAllocationMemoryService, getPriorCoveredExpenseAllocation } from "../../../../src/agent/memory/covered-expense-allocation-memory-service.js";
import { MockMemoryProvider } from "../../../../src/agent/memory/mock-memory.js";
import type { SavingsEvent } from "../../../../src/domain/savings/types.js";

const userId = "covered-allocation-memory-user";
const conversationId = "covered-allocation-memory-chat";
const event: SavingsEvent = {
  id: "event_1", userId, type: "avoided_spend", summary: "Employer covers monthly gym membership.",
  userProvidedAmountCents: 3500, classificationConfidence: 0.95, createdAt: "2026-10-29T12:00:00.000Z"
};

describe("CoveredExpenseAllocationMemoryService", () => {
  it("remembers an explicit horizon choice with bounded evidence and distinct-turn metadata", async () => {
    const memory = new MockMemoryProvider();
    await memory.setConversationContext(userId, conversationId, [
      "My employer now covers my $35 monthly gym membership.",
      "Victoria: The membership is $35 monthly or $420 annually if coverage continues. Which planning target do you prefer, monthly or annual?",
      "annual"
    ]);
    const service = new CoveredExpenseAllocationMemoryService(memory);
    const request = { userId, conversationId, message: "yes", sourceTurnReferences: [{ turnId: "confirm_1", userMessage: "yes" }] };

    await service.rememberChoice(request, event);
    await service.rememberChoice(request, event);

    const history = await memory.listConversationalMemories(userId);
    expect(history).toHaveLength(1);
    expect(history[0]).toMatchObject({
      category: "financial_pattern",
      key: "observed_behavior:covered_recurring_expense_to_savings",
      sourceType: "system_inference",
      evidence: expect.stringContaining("annual"),
      sourceMetadata: {
        memoryKind: "observed_behavior", observationCount: 1, lastPlanningHorizon: "annual",
        planningHorizonCounts: { monthly: 0, annual: 1 }, cadence: "month"
      }
    });
    expect(getPriorCoveredExpenseAllocation(history)).toEqual({
      priorCoveredExpenseAllocation: { lastPlanningHorizon: "annual", observationCount: 1 }
    });
  });

  it("does not infer a choice when no current target prompt and user answer are present", async () => {
    const memory = new MockMemoryProvider();
    await memory.setConversationContext(userId, conversationId, ["My employer now covers my $35 monthly gym membership."]);

    await new CoveredExpenseAllocationMemoryService(memory).rememberChoice(
      { userId, conversationId, message: "yes" }, event
    );

    expect(await memory.listConversationalMemories(userId)).toEqual([]);
  });
});
