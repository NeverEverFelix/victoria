import { describe, expect, it, vi } from "vitest";
import type { ActiveSavingsConversationState, ActiveSavingsProposalReference } from "../../../src/agent/conversation-state-manager.js";
import { PendingSavingsProposalService, type PendingSavingsProposalState } from "../../../src/agent/pending-savings-proposal-service.js";
import { PendingSavingsRevisionService } from "../../../src/agent/pending-savings-revision-service.js";
import type { AgentDecision, AgentRequest, AgentResponse, ClassifiedMessage } from "../../../src/agent/types.js";

const request: AgentRequest = { userId: "user-1", conversationId: "chat-1", message: "Actually, make it $25." };

function decision(): AgentDecision {
  return {
    action: "ask_follow_up",
    classification: { type: "avoided_spend", confidence: 0.95, summary: "purchase", needsClarification: false },
    proposal: {
      id: "proposal-1", eventId: "event-1", userId: "user-1", actionId: "action-1", status: "pending",
      suggestion: {
        id: "suggestion-1", amountCents: 2700, currency: "USD", reason: "Purchase avoided",
        source: "user_provided", movementMode: "mock_ledger"
      },
      createdAt: "2026-10-30T12:00:00.000Z"
    },
    userFacingMessage: "Confirm the pending entry?"
  };
}

function pendingState(): PendingSavingsProposalState {
  return {
    userId: request.userId,
    conversationKey: JSON.stringify([request.userId, request.conversationId]),
    decision: decision()
  };
}

function workflowState(): ActiveSavingsConversationState {
  return {
    actionId: "action-1", proposalId: "proposal-1", eventId: "event-1", status: "awaiting_confirmation",
    pendingRecordableAmountCents: 2700,
    sourceEvent: { id: "event-1", summary: "purchase", summaryProvenance: "validated_event_summary" }
  };
}

const exactReference: ActiveSavingsProposalReference = {
  actionId: "action-1", proposalId: "proposal-1", eventId: "event-1", matchedBy: "proposal_language"
};

function response(message = "replaced"): AgentResponse {
  return {
    message,
    decision: {
      action: "ask_follow_up",
      classification: { type: "proposal_revision", confidence: 1, summary: message, needsClarification: false },
      userFacingMessage: message
    }
  };
}

function revision(overrides: Partial<ClassifiedMessage> = {}): ClassifiedMessage {
  return {
    type: "proposal_revision", confidence: 1, amountCents: 2500,
    summary: "Actually, make it $25.", needsClarification: false,
    ...overrides
  };
}

describe("PendingSavingsRevisionService", () => {
  it("keeps the proposal unchanged and marks unresolved targets instead of replacing", () => {
    const proposals = new PendingSavingsProposalService();
    const pending = pendingState();
    proposals.set("action-1", pending);
    const replacePendingProposal = vi.fn(() => response());
    const service = new PendingSavingsRevisionService({ proposals, replacePendingProposal });

    const result = service.resolve({
      request, actionId: "action-1", pending, workflowState: workflowState(),
      proposalReference: { ...exactReference, eventId: "another-event" }, classification: revision()
    });

    expect(result.message).toContain("couldn't match that change");
    expect(replacePendingProposal).not.toHaveBeenCalled();
    expect(proposals.getForConversation(request.userId, pending.conversationKey)?.state)
      .toMatchObject({ awaitingRevisionTarget: true, decision: pending.decision });
  });

  it("stores invalid-amount clarification without replacing the active action", () => {
    const proposals = new PendingSavingsProposalService();
    const pending = pendingState();
    proposals.set("action-1", pending);
    const replacePendingProposal = vi.fn(() => response());
    const service = new PendingSavingsRevisionService({ proposals, replacePendingProposal });

    const result = service.resolve({
      request, actionId: "action-1", pending, workflowState: workflowState(),
      proposalReference: exactReference,
      classification: {
        type: "proposal_revision", confidence: 1, amountIssue: "multiple_amounts",
        summary: "Actually, make that $25 or $30.", needsClarification: true
      }
    });

    expect(result.message).toContain("more than one dollar amount");
    expect(replacePendingProposal).not.toHaveBeenCalled();
    expect(proposals.getForConversation(request.userId, pending.conversationKey))
      .toMatchObject({ actionId: "action-1", state: { awaitingValidRevision: true } });
  });

  it("keeps malformed referenced revisions pending and asks for one valid amount", () => {
    const proposals = new PendingSavingsProposalService();
    const pending = pendingState();
    proposals.set("action-1", pending);
    const replacePendingProposal = vi.fn(() => response());
    const service = new PendingSavingsRevisionService({ proposals, replacePendingProposal });

    const result = service.resolveInvalidAmountAttempt({
      request: { ...request, message: "Make it $25 or $30." },
      actionId: "action-1", pending, workflowState: workflowState(),
      proposalReference: exactReference, amountIssue: "multiple_amounts"
    });

    expect(result?.message).toContain("more than one dollar amount");
    expect(result?.decision).toMatchObject({
      action: "ask_follow_up", classification: { type: "proposal_revision", amountIssue: "multiple_amounts" }
    });
    expect(replacePendingProposal).not.toHaveBeenCalled();
    expect(proposals.getForConversation(request.userId, pending.conversationKey))
      .toMatchObject({ actionId: "action-1", state: { awaitingValidRevision: true, decision: pending.decision } });
  });

  it("does not accept an amount reply unless it is grounded as a revision follow-up", () => {
    const proposals = new PendingSavingsProposalService();
    const pending = { ...pendingState(), awaitingValidRevision: true };
    proposals.set("action-1", pending);
    const replacePendingProposal = vi.fn(() => response());
    const service = new PendingSavingsRevisionService({ proposals, replacePendingProposal });

    const result = service.resolveAwaitingAmount({
      request, actionId: "action-1", pending, workflowState: workflowState(),
      proposalReference: { ...exactReference, matchedBy: "source_event" },
      classification: { ...revision(), type: "avoided_spend" }
    });

    expect(result?.message).toContain("one clear USD amount");
    expect(result?.decision).toMatchObject({
      action: "ask_follow_up", classification: { type: "avoided_spend", amountCents: 2500 }
    });
    expect(replacePendingProposal).not.toHaveBeenCalled();
  });

  it("routes a precisely grounded amount reply through proposal replacement", () => {
    const proposals = new PendingSavingsProposalService();
    const pending = { ...pendingState(), awaitingValidRevision: true };
    proposals.set("action-1", pending);
    const replacePendingProposal = vi.fn(() => response("updated pending proposal"));
    const service = new PendingSavingsRevisionService({ proposals, replacePendingProposal });
    const amountReply: ClassifiedMessage = {
      ...revision(), type: "avoided_spend", summary: "$25"
    };

    const result = service.resolveAwaitingAmount({
      request, actionId: "action-1", pending, workflowState: workflowState(),
      proposalReference: { ...exactReference, matchedBy: "revision_follow_up" },
      classification: amountReply
    });

    expect(result?.message).toBe("updated pending proposal");
    expect(replacePendingProposal).toHaveBeenCalledExactlyOnceWith(request, pending.decision, {
      ...amountReply, type: "proposal_revision"
    });
  });

  it("delegates a grounded revision to the replacement callback with the same exact action", () => {
    const proposals = new PendingSavingsProposalService();
    const pending = pendingState();
    proposals.set("action-1", pending);
    const replacePendingProposal = vi.fn(() => response("new action pending"));
    const service = new PendingSavingsRevisionService({ proposals, replacePendingProposal });
    const classifiedRevision = revision();

    const result = service.resolve({
      request, actionId: "action-1", pending, workflowState: workflowState(),
      proposalReference: exactReference, classification: classifiedRevision
    });

    expect(result.message).toBe("new action pending");
    expect(replacePendingProposal).toHaveBeenCalledExactlyOnceWith(request, pending.decision, classifiedRevision);
  });
});
