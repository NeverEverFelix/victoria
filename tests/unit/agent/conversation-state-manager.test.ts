import { describe, expect, it } from "vitest";
import {
  buildActiveSavingsConversationState,
  buildAwaitingAmountConversationState,
  resolveActiveSavingsEventReference,
  resolveActiveSavingsProposalReference,
  revisePlanningState,
  selectConversationWorkflowState
} from "../../../src/agent/conversation-state-manager.js";
import type { AgentDecision } from "../../../src/agent/types.js";

const pendingDecision = {
  action: "suggest_savings",
  toolCall: { name: "createSavingsEntry", actionId: "action-1", arguments: {}, requiresApproval: true },
  proposal: {
    id: "proposal-1", eventId: "event-1", userId: "user-1", actionId: "action-1",
    suggestion: {
      amountCents: 3_500, currency: "USD", reason: "Covered gym membership", source: "user_provided",
      movementMode: "mock_ledger"
    },
    status: "pending", createdAt: "2026-10-26T00:00:00.000Z"
  },
  savingsEvent: {
    id: "event-1", userId: "user-1", type: "avoided_spend", summary: "I stopped paying $35/month for my gym.",
    merchantName: "gym", userProvidedAmountCents: 3_500,
    classificationConfidence: 0.95, createdAt: "2026-10-26T00:00:00.000Z"
  },
  planningChoice: { monthlyAmountCents: 3_500, annualProjectionCents: 42_000, selectedHorizon: "annual" },
  userFacingMessage: "The annual target is a projection."
} as unknown as AgentDecision;

describe("conversation state manager", () => {
  it("selects exactly one workflow for specialist context with confirmation taking precedence", () => {
    const awaitingAmount = buildAwaitingAmountConversationState("user-1", {
      classification: { type: "avoided_spend", confidence: 0.9, summary: "Skipped gym cost", needsClarification: true },
      savingsEvent: {
        id: "event-amount-1", userId: "user-1", type: "avoided_spend", summary: "Skipped gym.",
        classificationConfidence: 0.9, createdAt: "2026-10-26T00:00:00.000Z"
      }
    });
    const awaitingConfirmation = buildActiveSavingsConversationState("action-1", pendingDecision);

    expect(selectConversationWorkflowState({ awaitingAmount: awaitingAmount! })).toEqual(awaitingAmount);
    expect(selectConversationWorkflowState({ awaitingConfirmation: awaitingConfirmation! })).toEqual(awaitingConfirmation);
    expect(selectConversationWorkflowState({ awaitingAmount: awaitingAmount!, awaitingConfirmation: awaitingConfirmation! })).toEqual(awaitingConfirmation);
    expect(selectConversationWorkflowState({})).toBeUndefined();
  });

  it("represents a missing amount as an explicit, validated active workflow state", () => {
    const state = buildAwaitingAmountConversationState("user-1", {
      classification: { type: "avoided_spend", confidence: 0.9, summary: "Skipped gym cost", needsClarification: true },
      savingsEvent: {
        id: "event-amount-1", userId: "user-1", type: "avoided_spend",
        summary: "I skipped my $35 gym membership this month.", merchantName: "gym",
        classificationConfidence: 0.9, createdAt: "2026-10-26T00:00:00.000Z"
      }
    });

    expect(state).toEqual({
      status: "awaiting_amount", eventId: "event-amount-1", missingInformation: "amount",
      sourceEvent: {
        id: "event-amount-1", summary: "I skipped my $35 gym membership this month.",
        summaryProvenance: "validated_event_summary", merchantName: "gym"
      }
    });
  });

  it("rejects amount-clarification state whose event belongs to another user", () => {
    expect(buildAwaitingAmountConversationState("user-2", {
      classification: { type: "avoided_spend", confidence: 0.9, summary: "Skipped gym cost", needsClarification: true },
      savingsEvent: {
        id: "event-amount-1", userId: "user-1", type: "avoided_spend", summary: "Skipped gym.",
        classificationConfidence: 0.9, createdAt: "2026-10-26T00:00:00.000Z"
      }
    })).toBeUndefined();
  });

  it("revises the selected planning period while preserving pending proposal identity and recordable amount", () => {
    const state = buildActiveSavingsConversationState("action-1", pendingDecision);
    expect(state).toMatchObject({
      actionId: "action-1", proposalId: "proposal-1", eventId: "event-1", status: "awaiting_confirmation",
      pendingRecordableAmountCents: 3_500,
      sourceEvent: {
        id: "event-1", summary: "I stopped paying $35/month for my gym.",
        summaryProvenance: "validated_event_summary", merchantName: "gym", userProvidedAmountCents: 3_500
      },
      planningChoice: {
        monthlyAmountCents: 3_500, annualProjectionCents: 42_000,
        selectedPeriod: "annual", selectedAmountCents: 42_000, targetType: "conditional_projection"
      }
    });

    const transition = revisePlanningState(state, {
      kind: "resolved", period: "monthly", amountCents: 3_500,
      amountMeaning: "current_period_amount", operation: "select_target"
    });

    expect(transition.kind).toBe("revised");
    if (transition.kind !== "revised") return;
    expect(transition.state).toMatchObject({
      actionId: "action-1", proposalId: "proposal-1", eventId: "event-1", status: "awaiting_confirmation",
      pendingRecordableAmountCents: 3_500,
      sourceEvent: { id: "event-1", summary: "I stopped paying $35/month for my gym." },
      planningChoice: {
        monthlyAmountCents: 3_500, annualProjectionCents: 42_000,
        selectedPeriod: "monthly", selectedAmountCents: 3_500, targetType: "current_period_amount"
      }
    });
  });

  it("ignores a reference whose amount does not match the selected period", () => {
    const state = buildActiveSavingsConversationState("action-1", pendingDecision);
    expect(revisePlanningState(state, {
      kind: "resolved", period: "annual", amountCents: 3_500,
      amountMeaning: "conditional_projection", operation: "request_recording"
    })).toEqual({ kind: "unavailable" });
  });

  it("does not build active state when the pending action ID does not match the proposal", () => {
    expect(buildActiveSavingsConversationState("other-action", pendingDecision)).toBeUndefined();
  });

  it("does not attach an event summary to a proposal when their event IDs disagree", () => {
    expect(buildActiveSavingsConversationState("action-1", {
      ...pendingDecision,
      savingsEvent: { ...pendingDecision.savingsEvent!, id: "different-event" }
    })).toBeUndefined();
  });

  it("resolves explicit source labels and leaves vague or competing references unresolved", () => {
    const state = buildActiveSavingsConversationState("action-1", pendingDecision);
    expect(resolveActiveSavingsEventReference("Please record that gym membership amount", state)).toEqual({
      eventId: "event-1", matchedBy: "merchant_name"
    });
    expect(resolveActiveSavingsEventReference("What about that?", state)).toBeUndefined();
    expect(resolveActiveSavingsEventReference("I'm going to the gym later", state)).toBeUndefined();
    expect(resolveActiveSavingsEventReference("Maybe that gym or the other one", state)).toBeUndefined();
  });

  it("resolves explicit proposal revisions without treating them as approval", () => {
    const state = buildActiveSavingsConversationState("action-1", pendingDecision);
    expect(resolveActiveSavingsProposalReference("Actually, make that $75 instead.", state)).toEqual({
      actionId: "action-1", proposalId: "proposal-1", eventId: "event-1", matchedBy: "proposal_language"
    });
    expect(resolveActiveSavingsProposalReference("Actually, make that $6 or $8.", state)).toEqual({
      actionId: "action-1", proposalId: "proposal-1", eventId: "event-1", matchedBy: "proposal_language"
    });
    expect(resolveActiveSavingsProposalReference("Change the gym suggestion to $40.", state)).toMatchObject({
      actionId: "action-1", proposalId: "proposal-1", eventId: "event-1", matchedBy: "proposal_language"
    });
    expect(resolveActiveSavingsProposalReference("Actually revise my coffee-shop purchase to $40.", state)).toBeUndefined();
    expect(resolveActiveSavingsProposalReference("Revise the earlier gym expense to $40.", state)).toBeUndefined();
    expect(resolveActiveSavingsProposalReference("I changed my mind.", state)).toBeUndefined();
    expect(resolveActiveSavingsProposalReference("Maybe change that or leave it.", state)).toBeUndefined();
    expect(resolveActiveSavingsProposalReference("Yes, record it.", state)).toBeUndefined();
  });

  it("binds a clear amount-only reply to an outstanding revision question", () => {
    const state = buildActiveSavingsConversationState("action-1", pendingDecision, { awaitingValidRevision: true });
    expect(resolveActiveSavingsProposalReference("Use $8.", state)).toEqual({
      actionId: "action-1", proposalId: "proposal-1", eventId: "event-1", matchedBy: "revision_follow_up"
    });
    expect(resolveActiveSavingsProposalReference("I spent $8 on books.", state)).toBeUndefined();
    expect(resolveActiveSavingsProposalReference("$8 or $10", state)).toBeUndefined();
  });
});
