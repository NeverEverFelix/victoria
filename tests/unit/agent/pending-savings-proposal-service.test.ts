import { describe, expect, it } from "vitest";
import { PendingSavingsProposalService } from "../../../src/agent/pending-savings-proposal-service.js";
import type { AgentDecision } from "../../../src/agent/types.js";

describe("PendingSavingsProposalService", () => {
  it("isolates proposals by user and exact conversation key", () => {
    const service = new PendingSavingsProposalService();
    const state = pending("user-a", "[\"user-a\",\"chat:a\"]");
    service.set("action-a", state);

    expect(service.getForConversation("user-a", state.conversationKey)?.actionId).toBe("action-a");
    expect(service.getForConversation("user-b", state.conversationKey)).toBeUndefined();
    expect(service.getForConversation("user-a", "[\"user-a\",\"chat\",\"a\"]")).toBeUndefined();
    expect(service.getByAction("user-b", "action-a")).toBeUndefined();
  });

  it("expires only the scoped current proposal", () => {
    const service = new PendingSavingsProposalService();
    const state = pending("user-a", "conversation-a", "2026-10-29T00:00:00.000Z");
    service.set("action-a", state);

    expect(service.expireForConversation("user-b", state.conversationKey, () => true)).toBeUndefined();
    expect(service.getForConversation("user-a", state.conversationKey)?.actionId).toBe("action-a");
    expect(service.expireForConversation("user-a", state.conversationKey, () => true)).toEqual(state);
    expect(service.getForConversation("user-a", state.conversationKey)).toBeUndefined();
  });

  it("drops a superseded action when a replacement proposal is indexed", () => {
    const service = new PendingSavingsProposalService();
    const first = pending("user-a", "conversation-a");
    const replacement = pending("user-a", "conversation-a");
    service.set("action-a", first);
    service.set("action-b", replacement);

    expect(service.getForConversation("user-a", first.conversationKey)?.actionId).toBe("action-b");
    expect(service.getByAction("user-a", "action-a")).toBeUndefined();
  });

  it("retains revision flags and approval metadata when setting an approval", () => {
    const service = new PendingSavingsProposalService();
    const state = { ...pending("user-a", "conversation-a"), awaitingValidRevision: true };
    service.set("action-a", state);
    const approval = { id: "approval-a", userId: "user-a", actionId: "action-a", proposalId: "proposal-a", approvedAt: "2026-10-30T00:00:00.000Z", source: "user_message" as const };

    expect(service.setApproval("user-b", "action-a", approval)).toBe(false);
    expect(service.setApproval("user-a", "action-a", approval)).toBe(true);
    expect(service.getForConversation("user-a", state.conversationKey)).toEqual({
      actionId: "action-a", state: { ...state, approval }
    });
  });

  it("declines and removes only the matching user's pending proposal", () => {
    const service = new PendingSavingsProposalService();
    const state = pending("user-a", JSON.stringify(["user-a", "chat-a"]));
    const decision: AgentDecision = {
      action: "ask_follow_up",
      classification: { type: "avoided_spend", confidence: 1, summary: "purchase avoided", needsClarification: false },
      toolCall: { name: "createSavingsEntry", actionId: "action-a", arguments: {}, requiresApproval: true },
      userFacingMessage: "Would you like me to record this mocked savings entry?",
      proposal: {
        id: "proposal-a", eventId: "event-a", userId: "user-a", actionId: "action-a", status: "pending",
        suggestion: { id: "suggestion-a", amountCents: 2500, currency: "USD", reason: "purchase avoided", source: "user_provided", movementMode: "mock_ledger" },
        createdAt: "2026-10-30T12:00:00.000Z"
      }
    };
    service.set("action-a", { ...state, decision });

    const unauthorized = service.decline({
      request: { userId: "user-b", conversationId: "chat-a", message: "No" },
      actionId: "action-a", transitionId: "transition-a", createdAt: "2026-10-30T12:01:00.000Z"
    });
    expect(unauthorized).toBeUndefined();
    expect(service.getByAction("user-a", "action-a")?.decision.proposal?.status).toBe("pending");

    const wrongConversation = service.decline({
      request: { userId: "user-a", conversationId: "another-chat", message: "No" },
      actionId: "action-a", transitionId: "transition-a", createdAt: "2026-10-30T12:01:00.000Z"
    });
    expect(wrongConversation).toBeUndefined();
    expect(service.getByAction("user-a", "action-a")?.decision.proposal?.status).toBe("pending");

    const declined = service.decline({
      request: { userId: "user-a", conversationId: "chat-a", message: "No" },
      actionId: "action-a", transitionId: "transition-a", createdAt: "2026-10-30T12:01:00.000Z"
    });
    expect(declined?.proposal?.status).toBe("declined");
    expect(declined?.proposalTransitions).toHaveLength(1);
    expect(service.getByAction("user-a", "action-a")).toBeUndefined();
  });

  it("hydrates a typed workflow snapshot and restores its planning horizon from scoped dialogue", () => {
    const service = new PendingSavingsProposalService();
    const userId = "user-a";
    const conversationKey = JSON.stringify([userId, "chat-a"]);
    const summary = "My employer now covers my $35 monthly gym membership.";
    const decision: AgentDecision = {
      action: "ask_follow_up",
      classification: { type: "avoided_spend", confidence: 0.95, summary, needsClarification: false },
      toolCall: { name: "createSavingsEntry", actionId: "action-a", arguments: {}, requiresApproval: true },
      proposal: {
        id: "proposal-a", eventId: "event-a", userId, actionId: "action-a", status: "pending",
        suggestion: {
          id: "suggestion-a", amountCents: 3_500, currency: "USD", reason: "Monthly gym expense is covered",
          source: "user_provided", movementMode: "mock_ledger"
        },
        createdAt: "2026-10-30T12:00:00.000Z"
      },
      savingsEvent: {
        id: "event-a", userId, type: "avoided_spend", summary, userProvidedAmountCents: 3_500,
        classificationConfidence: 0.95, createdAt: "2026-10-30T12:00:00.000Z"
      },
      planningChoice: { monthlyAmountCents: 3_500, annualProjectionCents: 42_000 },
      userFacingMessage: "Which planning amount do you prefer?"
    };
    const state = { ...pending(userId, conversationKey), decision, awaitingValidRevision: true };
    service.set("action-a", state);

    const context = service.getContextForConversation(userId, conversationKey, [
      summary,
      "Victoria: Which amount would you like to use for planning: monthly or annual?",
      "Annual"
    ]);

    expect(context?.actionId).toBe("action-a");
    expect(context?.state.decision.planningChoice?.selectedHorizon).toBe("annual");
    expect(context?.workflowState).toMatchObject({
      actionId: "action-a", proposalId: "proposal-a", status: "awaiting_confirmation",
      awaitingValidRevision: true,
      planningChoice: { selectedPeriod: "annual", selectedAmountCents: 42_000, targetType: "conditional_projection" }
    });
    expect(service.getForConversation(userId, conversationKey)?.state).toEqual(context?.state);
  });
});

function pending(userId: string, conversationKey: string, createdAt = "2026-10-30T00:00:00.000Z") {
  return {
    userId,
    conversationKey,
    decision: { proposal: { createdAt } } as AgentDecision
  };
}
