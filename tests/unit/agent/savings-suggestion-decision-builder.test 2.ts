import { describe, expect, it } from "vitest";
import { buildSavingsSuggestionDecision } from "../../../src/agent/savings-suggestion-decision-builder.js";
import type { ClassifiedMessage, SavingsEvent, SavingsSuggestion } from "../../../src/agent/types.js";

const classification: ClassifiedMessage = {
  type: "avoided_spend",
  summary: "Skipped a jacket purchase",
  amountCents: 2_700,
  confidence: 0.95,
  needsClarification: false
};

const savingsEvent: SavingsEvent = {
  id: "event-1",
  userId: "user-1",
  type: "avoided_spend",
  summary: classification.summary,
  userProvidedAmountCents: 2_700,
  classificationConfidence: 0.95,
  createdAt: "2026-10-30T12:00:00.000Z"
};

const suggestion: SavingsSuggestion = {
  id: "suggestion-1",
  amountCents: 2_700,
  currency: "USD",
  reason: "Skipped a jacket purchase",
  source: "user_provided",
  movementMode: "mock_ledger"
};

describe("buildSavingsSuggestionDecision", () => {
  it("creates a pending mock-ledger proposal with an exact approval-gated tool call", () => {
    const decision = buildSavingsSuggestionDecision({
      classification,
      savingsEvent,
      suggestion,
      actionId: "action-1",
      proposalId: "proposal-1",
      createdAt: "2026-10-30T12:01:00.000Z"
    });

    expect(decision.action).toBe("suggest_savings");
    expect(decision.proposal).toMatchObject({
      id: "proposal-1",
      eventId: "event-1",
      userId: "user-1",
      actionId: "action-1",
      status: "pending",
      createdAt: "2026-10-30T12:01:00.000Z",
      suggestion: { amountCents: 2_700, movementMode: "mock_ledger" }
    });
    expect(decision.toolCall).toMatchObject({
      name: "createSavingsEntry",
      actionId: "action-1",
      requiresApproval: true,
      movementMode: "mock_ledger",
      arguments: { eventId: "event-1", proposalId: "proposal-1", amountCents: 2_700 }
    });
    expect(decision.userFacingMessage).toContain("No real money has moved yet");
    expect(decision.userFacingMessage).toContain("mocked ledger record");
  });

  it("labels remembered merchant estimates as estimates and names their source", () => {
    const decision = buildSavingsSuggestionDecision({
      classification: {
        type: "avoided_spend",
        summary: "Skipped a jacket purchase",
        confidence: 0.95,
        needsClarification: false,
        merchantName: "Corner Cafe"
      },
      savingsEvent,
      suggestion: { ...suggestion, source: "merchant_history" },
      actionId: "action-2",
      proposalId: "proposal-2",
      createdAt: "2026-10-30T12:01:00.000Z"
    });

    expect(decision.userFacingMessage).toContain("Based on your usual spend at Corner Cafe, I estimate");
    expect(decision.userFacingMessage).toContain("No real money has moved yet");
  });
});
