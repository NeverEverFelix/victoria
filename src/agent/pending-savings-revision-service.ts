import { formatUsd } from "../domain/money.js";
import type { ActiveSavingsConversationState, ActiveSavingsProposalReference } from "./conversation-state-manager.js";
import type { AgentDecision, AgentRequest, AgentResponse, ClassifiedMessage } from "./types.js";
import type { PendingSavingsProposalService, PendingSavingsProposalState } from "./pending-savings-proposal-service.js";

export type PendingRevisionAmountIssue = NonNullable<ClassifiedMessage["amountIssue"]>;

/** Validates proposal-revision references and clarification state before replacement. */
export class PendingSavingsRevisionService {
  constructor(private readonly dependencies: {
    readonly proposals: PendingSavingsProposalService;
    readonly replacePendingProposal: (
      request: AgentRequest,
      decision: AgentDecision,
      classification: ClassifiedMessage
    ) => AgentResponse;
  }) {}

  resolveInvalidAmountAttempt(input: {
    readonly request: AgentRequest;
    readonly actionId: string;
    readonly pending: PendingSavingsProposalState;
    readonly workflowState?: ActiveSavingsConversationState;
    readonly proposalReference?: ActiveSavingsProposalReference;
    readonly amountIssue: PendingRevisionAmountIssue;
  }): AgentResponse | undefined {
    const { request, actionId, pending, workflowState, proposalReference, amountIssue } = input;
    if (pending.userId !== request.userId || !workflowState || actionId !== workflowState.actionId ||
        proposalReference?.actionId !== workflowState.actionId ||
        proposalReference.proposalId !== workflowState.proposalId ||
        proposalReference.eventId !== workflowState.eventId) return undefined;

    this.dependencies.proposals.set(actionId, { ...pending, awaitingValidRevision: true });
    const message = amountIssue === "multiple_amounts"
      ? "I found more than one dollar amount, so I haven't changed the pending suggestion. Which single amount in USD should I use?"
      : amountIssue === "invalid_precision"
        ? "That revised amount has more than two decimal places, so I haven't changed the pending suggestion. What amount in USD should I use?"
        : amountIssue === "unsupported_currency"
          ? "I can only record USD amounts, so I haven't changed the pending suggestion. What amount in USD should I use?"
          : "A savings amount must be positive, so I haven't changed the pending suggestion. What positive amount in USD should I use?";
    const classification: ClassifiedMessage = {
      type: "proposal_revision", confidence: 1, amountIssue,
      summary: request.message.slice(0, 500), needsClarification: true
    };
    return followUp(pending.decision, classification, message);
  }

  resolve(input: {
    readonly request: AgentRequest;
    readonly actionId: string;
    readonly pending: PendingSavingsProposalState;
    readonly workflowState?: ActiveSavingsConversationState;
    readonly proposalReference?: ActiveSavingsProposalReference;
    readonly classification: ClassifiedMessage;
  }): AgentResponse {
    const { request, actionId, pending, workflowState, proposalReference, classification } = input;
    if (classification.type !== "proposal_revision" || pending.userId !== request.userId) {
      throw new Error("PendingSavingsRevisionService requires a scoped proposal revision.");
    }

    if (!workflowState || actionId !== workflowState.actionId || proposalReference?.actionId !== workflowState.actionId ||
        proposalReference.proposalId !== workflowState.proposalId ||
        proposalReference.eventId !== workflowState.eventId) {
      this.dependencies.proposals.set(actionId, { ...pending, awaitingRevisionTarget: true });
      const message = "I couldn't match that change to the active savings suggestion. I can't target an older event from this request. Please decline the current suggestion before starting a separate savings request; nothing has been changed or recorded.";
      return followUp(pending.decision, classification, message);
    }

    if (classification.amountIssue) {
      this.dependencies.proposals.set(actionId, { ...pending, awaitingValidRevision: true });
      const message = classification.amountIssue === "invalid_value"
        ? "A savings amount must be positive, so I haven't changed the pending suggestion. What positive amount in USD should I use?"
        : classification.amountIssue === "multiple_amounts"
          ? "I found more than one dollar amount, so I haven't changed the pending suggestion. Which single amount in USD should I use?"
          : classification.amountIssue === "invalid_precision"
            ? "That revised amount has more than two decimal places, so I haven't changed the pending suggestion. What amount in USD should I use?"
            : "I can only record USD amounts, so I haven't changed the pending suggestion. What amount in USD should I use?";
      return followUp(pending.decision, classification, message);
    }

    if (classification.amountCents !== undefined || classification.revisionReason !== undefined ||
        pending.awaitingValidRevision) {
      if (pending.awaitingValidRevision && classification.amountCents === undefined) {
        return followUp(
          pending.decision,
          classification,
          "Please provide a valid USD amount for the correction and make it unambiguous, or decline the pending suggestion."
        );
      }
      return this.dependencies.replacePendingProposal(request, pending.decision, classification);
    }

    const currentAmount = pending.decision.proposal?.suggestion.amountCents;
    const message = currentAmount === undefined
      ? "I couldn't identify a supported change. The current savings suggestion is unchanged and still pending. Please confirm or decline it."
      : `I can only revise the amount or reason here. The current suggestion remains ${formatUsd(currentAmount)} in USD in the mocked ledger and is still pending. Please confirm or decline that exact suggestion.`;
    return followUp(pending.decision, classification, message);
  }

  resolveAwaitingAmount(input: {
    readonly request: AgentRequest;
    readonly actionId: string;
    readonly pending: PendingSavingsProposalState;
    readonly workflowState?: ActiveSavingsConversationState;
    readonly proposalReference?: ActiveSavingsProposalReference;
    readonly classification: ClassifiedMessage;
  }): AgentResponse | undefined {
    const { request, actionId, pending, workflowState, proposalReference, classification } = input;
    if (!pending.awaitingValidRevision || classification.amountCents === undefined) return undefined;
    if (!workflowState || actionId !== workflowState.actionId || proposalReference?.actionId !== workflowState.actionId ||
        proposalReference.proposalId !== workflowState.proposalId ||
        proposalReference.eventId !== workflowState.eventId ||
        proposalReference.matchedBy !== "revision_follow_up") {
      return followUp(
        pending.decision,
        classification,
        "Please provide one clear USD amount for the pending suggestion revision, or decline the pending suggestion. I haven't changed or recorded it."
      );
    }
    return this.dependencies.replacePendingProposal(request, pending.decision, {
      ...classification,
      type: "proposal_revision"
    });
  }
}

function followUp(
  decision: AgentDecision,
  classification: ClassifiedMessage,
  message: string
): AgentResponse {
  return {
    message,
    decision: { ...decision, action: "ask_follow_up", classification, userFacingMessage: message }
  };
}
