import { describe, expect, it, vi } from "vitest";
import type { BuiltTurnContext } from "../../../src/agent/financial-fact-service.js";
import { PendingSavingsConfirmationService } from "../../../src/agent/pending-savings-confirmation-service.js";
import type { PendingSavingsProposalState } from "../../../src/agent/pending-savings-proposal-service.js";
import type { AgentDecision, AgentRequest, AgentResponse } from "../../../src/agent/types.js";

describe("PendingSavingsConfirmationService outcome", () => {
  it("returns an approved outcome only when the approval handler returns a ledger-entry decision", async () => {
    const decision = pendingDecision();
    const request: AgentRequest = { userId: "user-1", conversationId: "chat-1", message: "Yes" };
    const response = { message: "Recorded $10.00 in the mocked ledger.", decision: {
      ...decision, action: "create_ledger_entry", userFacingMessage: "Recorded $10.00 in the mocked ledger."
    } } satisfies AgentResponse;
    const approve = vi.fn(async () => response);
    const service = createService(approve);

    const outcome = await service.resolve({
      request, recentTurns: [], turnContext: {} as BuiltTurnContext,
      pending: { actionId: "action-1", state: pendingState(decision) }
    });

    expect(outcome).toEqual({ kind: "handled", outcome: "approved", response });
    expect(approve).toHaveBeenCalledExactlyOnceWith({ ...request, approvedActionId: "action-1" }, decision);
  });

  it("returns a pending outcome for a confirmation that still needs clarification", async () => {
    const decision = pendingDecision();
    const approve = vi.fn(async () => ({ message: "Unexpected", decision } satisfies AgentResponse));
    const service = createService(approve);

    const outcome = await service.resolve({
      request: { userId: "user-1", conversationId: "chat-1", message: "Yes" },
      recentTurns: [], turnContext: {} as BuiltTurnContext,
      pending: { actionId: "action-1", state: pendingState(decision, true) }
    });

    expect(outcome.kind).toBe("handled");
    if (outcome.kind !== "handled") return;
    expect(outcome.outcome).toBe("pending");
    expect(outcome.response.decision.action).toBe("ask_follow_up");
    expect(approve).not.toHaveBeenCalled();
  });
});

function createService(approve: (request: AgentRequest, decision: AgentDecision) => Promise<AgentResponse>) {
  return new PendingSavingsConfirmationService({
    proposals: {} as never,
    declineResponses: {} as never,
    historyResponses: {} as never,
    planningResponses: {} as never,
    readOnlyResponses: {} as never,
    approve,
    createTransitionId: () => "transition-1",
    responderEnabled: true
  });
}

function pendingDecision(): AgentDecision {
  return {
    action: "suggest_savings",
    classification: { type: "avoided_spend", confidence: 1, summary: "Canceled a subscription.", needsClarification: false },
    suggestion: {
      id: "suggestion-1", amountCents: 1_000, currency: "USD", reason: "User-provided amount",
      source: "user_provided", movementMode: "mock_ledger"
    },
    userFacingMessage: "Would you like me to record $10.00?"
  };
}

function pendingState(decision: AgentDecision, awaitingValidRevision = false): PendingSavingsProposalState {
  return {
    userId: "user-1",
    conversationKey: JSON.stringify(["user-1", "chat-1"]),
    decision,
    ...(awaitingValidRevision ? { awaitingValidRevision: true } : {})
  };
}
