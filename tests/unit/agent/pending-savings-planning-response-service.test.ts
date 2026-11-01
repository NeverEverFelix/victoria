import { describe, expect, it } from "vitest";
import { buildActiveSavingsConversationState } from "../../../src/agent/conversation-state-manager.js";
import { PendingSavingsProposalService } from "../../../src/agent/pending-savings-proposal-service.js";
import { PendingSavingsPlanningResponseService } from "../../../src/agent/pending-savings-planning-response-service.js";
import type { AgentDecision, AgentRequest } from "../../../src/agent/types.js";

const request: AgentRequest = { userId: "user-1", conversationId: "chat-1", message: "annual target" };

function decision(): AgentDecision {
  return {
    action: "ask_follow_up",
    classification: { type: "avoided_spend", confidence: 1, summary: "gym covered", needsClarification: false },
    toolCall: { name: "createSavingsEntry", actionId: "action-1", arguments: {}, requiresApproval: true },
    suggestion: { id: "suggestion-1", amountCents: 3500, currency: "USD", reason: "Gym covered", source: "user_provided", movementMode: "mock_ledger" },
    proposal: {
      id: "proposal-1", eventId: "event-1", userId: request.userId, actionId: "action-1", status: "pending",
      suggestion: { id: "suggestion-1", amountCents: 3500, currency: "USD", reason: "Gym covered", source: "user_provided", movementMode: "mock_ledger" },
      createdAt: "2026-10-30T12:00:00.000Z"
    },
    savingsEvent: {
      id: "event-1", userId: request.userId, type: "avoided_spend", summary: "Gym covered",
      userProvidedAmountCents: 3500, classificationConfidence: 1, createdAt: "2026-10-30T12:00:00.000Z"
    },
    planningChoice: { monthlyAmountCents: 3500, annualProjectionCents: 42000 },
    userFacingMessage: "Which planning target do you prefer?"
  };
}

describe("PendingSavingsPlanningResponseService", () => {
  it("updates the scoped planning target while leaving the proposal pending", () => {
    const proposals = new PendingSavingsProposalService();
    const pending = { userId: request.userId, conversationKey: JSON.stringify([request.userId, request.conversationId]), decision: decision() };
    proposals.set("action-1", pending);
    const workflowState = buildActiveSavingsConversationState("action-1", pending.decision);
    expect(workflowState).toBeDefined();
    const service = new PendingSavingsPlanningResponseService(proposals);

    const result = service.resolveChoice({ request, actionId: "action-1", pending, workflowState: workflowState! });

    expect(result?.message).toContain("$420.00 is the yearly target");
    expect(result?.decision.proposal?.status).toBe("pending");
    expect(result?.decision.planningChoice?.selectedHorizon).toBe("annual");
    expect(proposals.getByAction(request.userId, "action-1")?.decision.planningChoice?.selectedHorizon).toBe("annual");
  });

  it("does not resolve or persist a planning reference from another user's proposal", () => {
    const proposals = new PendingSavingsProposalService();
    const pending = { userId: "user-2", conversationKey: JSON.stringify(["user-2", "chat-1"]), decision: decision() };
    proposals.set("action-1", pending);
    const workflowState = buildActiveSavingsConversationState("action-1", pending.decision);
    expect(workflowState).toBeDefined();
    const service = new PendingSavingsPlanningResponseService(proposals);

    const result = service.resolveChoice({ request, actionId: "action-1", pending, workflowState: workflowState! });

    expect(result).toBeUndefined();
    expect(proposals.getByAction("user-2", "action-1")?.decision.planningChoice?.selectedHorizon).toBeUndefined();
  });

  it("answers projection questions without recording and clarifies combined recording targets", () => {
    const proposals = new PendingSavingsProposalService();
    const pending = { userId: request.userId, conversationKey: JSON.stringify([request.userId, request.conversationId]), decision: decision() };
    proposals.set("action-1", pending);
    const service = new PendingSavingsPlanningResponseService(proposals);
    const recordThisMonth: AgentRequest = { ...request, message: "Can you record this month?" };

    const single = service.resolveProjection({
      request: recordThisMonth, pending, recentTurns: [],
      annualProjection: { monthlyAmountCents: 3500, annualAmountCents: 42000, eventCount: 1 }
    });
    expect(single?.message).toContain("Say yes to confirm recording that amount");
    expect(single?.decision.action).toBe("ask_follow_up");

    const combined = service.resolveProjection({
      request: recordThisMonth, pending, recentTurns: [],
      annualProjection: { monthlyAmountCents: 5500, annualAmountCents: 66000, eventCount: 2 },
      recurringCosts: [{ monthlyAmountCents: 3500 }, { monthlyAmountCents: 2000 }]
    });
    expect(combined?.message).toContain("Which single monthly cost do you mean");
    expect(combined?.decision.action).toBe("ask_follow_up");
    expect(proposals.getByAction(request.userId, "action-1")?.decision.proposal?.status).toBe("pending");
  });
});
