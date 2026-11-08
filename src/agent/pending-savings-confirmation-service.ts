import { interpretApprovalResponse } from "./policy.js";
import type { ActiveSavingsConversationState } from "./conversation-state-manager.js";
import type { BuiltTurnContext } from "./financial-fact-service.js";
import type { PendingSavingsProposalState } from "./pending-savings-proposal-service.js";
import type { PendingSavingsDeclineResponseService } from "./pending-savings-decline-response-service.js";
import type { PendingSavingsHistoryResponseService } from "./pending-savings-history-response-service.js";
import type { PendingSavingsPlanningResponseService } from "./pending-savings-planning-response-service.js";
import type { PendingSavingsReadOnlyResponseService } from "./pending-savings-read-only-response-service.js";
import type { PendingSavingsProposalService } from "./pending-savings-proposal-service.js";
import { isReadOnlyEventHistoryQuestion } from "./conversation-routing.js";
import { buildConversationIntentPlan } from "./conversation-intent-plan.js";
import type { AgentDecision, AgentRequest, AgentResponse } from "./types.js";

export type PendingSavingsConfirmationOutcome =
  | { readonly kind: "unhandled" }
  | {
      readonly kind: "handled";
      /** The response describes what this turn did; it does not grant action authority. */
      readonly outcome: "approved" | "declined" | "pending";
      readonly response: AgentResponse;
    };

/** Resolves replies to one active savings proposal; only the exact approval callback can mutate. */
export class PendingSavingsConfirmationService {
  constructor(private readonly dependencies: {
    readonly proposals: PendingSavingsProposalService;
    readonly declineResponses: PendingSavingsDeclineResponseService;
    readonly historyResponses: PendingSavingsHistoryResponseService;
    readonly planningResponses: PendingSavingsPlanningResponseService;
    readonly readOnlyResponses: PendingSavingsReadOnlyResponseService;
    readonly approve: (request: AgentRequest, decision: AgentDecision) => Promise<AgentResponse>;
    readonly createTransitionId: () => string;
    readonly responderEnabled: boolean;
  }) {}

  async resolve(input: {
    readonly request: AgentRequest;
    readonly recentTurns: readonly string[];
    readonly turnContext: BuiltTurnContext;
    readonly pending: { readonly actionId: string; readonly state: PendingSavingsProposalState };
    readonly workflowState?: ActiveSavingsConversationState;
    readonly annualProjection?: { readonly monthlyAmountCents: number; readonly annualAmountCents: number; readonly eventCount: number };
    readonly recurringCosts?: readonly { readonly monthlyAmountCents: number }[];
  }): Promise<PendingSavingsConfirmationOutcome> {
    const { request, recentTurns, turnContext, pending, workflowState, annualProjection, recurringCosts } = input;
    const { actionId, state } = pending;
    const approvalResponse = interpretApprovalResponse(request.message, state.decision.suggestion?.amountCents);

    if (state.decision.planningChoice && !state.decision.planningChoice.selectedHorizon &&
        approvalResponse === "explicit_approval") {
      const message = "Which amount would you like to use for planning: monthly or annual? I haven't asked to record a ledger entry yet.";
      return handled("pending", { message, decision: { ...state.decision, action: "ask_follow_up", userFacingMessage: message } });
    }

    if ((state.awaitingValidRevision || state.awaitingRevisionTarget) &&
        (approvalResponse === "explicit_approval" || approvalResponse === "ambiguous")) {
      const message = state.awaitingRevisionTarget
        ? "I couldn't match that change to the active savings suggestion. I can't target an older event from this request. Please decline the current suggestion before starting a separate savings request; nothing has been changed or recorded."
        : "I need a valid USD amount for that correction before asking you to confirm. Please provide one unambiguous amount or decline the pending suggestion.";
      return handled("pending", { message, decision: { ...state.decision, action: "ask_follow_up", userFacingMessage: message } });
    }

    if (approvalResponse === "explicit_approval") {
      const response = await this.dependencies.approve({ ...request, approvedActionId: actionId }, state.decision);
      return handled(response.decision.action === "create_ledger_entry" ? "approved" : "pending", response);
    }

    if (approvalResponse === "explicit_decline") {
      const decline = state.decision.toolCall?.actionId
        ? this.dependencies.proposals.decline({
            request,
            actionId: state.decision.toolCall.actionId,
            transitionId: this.dependencies.createTransitionId(),
            createdAt: new Date().toISOString()
          })
        : undefined;
      const proposalTransitions = decline?.proposalTransitions ?? state.decision.proposalTransitions ?? [];
      const response = await this.dependencies.declineResponses.respond({
        request,
        recentTurns,
        turnContext,
        pendingDecision: state.decision,
        ...(decline?.proposal ? { declinedProposal: decline.proposal } : {}),
        ...(proposalTransitions.length ? { proposalTransitions } : {})
      });
      return handled("declined", response);
    }

    if (approvalResponse === "not_approval" && !state.awaitingValidRevision && !state.awaitingRevisionTarget &&
        this.dependencies.responderEnabled && isReadOnlyEventHistoryQuestion(request.message)) {
      return handled("pending", await this.dependencies.historyResponses.respond({
        request,
        recentTurns,
        turnContext,
        ...(workflowState ? { workflowState } : {})
      }));
    }

    const turnPlan = buildConversationIntentPlan({
      message: request.message,
      recentTurns,
      hasPendingWorkflow: true
    });
    if (!state.awaitingValidRevision && !state.awaitingRevisionTarget &&
        turnPlan.actionRequest.kind === "mock_ledger_record" &&
        turnPlan.dialogueActs.includes("attempt_confirmation") &&
        turnPlan.readOnlyQuestions.length > 0 && this.dependencies.responderEnabled) {
      const response = await this.dependencies.readOnlyResponses.resolve({
        kind: "ambiguous_confirmation", request, recentTurns, turnContext,
        pendingDecision: state.decision,
        ...(workflowState ? { workflowState } : {})
      });
      return response ? handled("pending", response) : { kind: "unhandled" };
    }

    const planningChoice = this.dependencies.planningResponses.resolveChoice({
      request, actionId, pending: state,
      ...(workflowState ? { workflowState } : {})
    });
    if (planningChoice) return handled("pending", planningChoice);

    const projection = this.dependencies.planningResponses.resolveProjection({
      request,
      pending: state,
      recentTurns,
      ...(annualProjection ? { annualProjection } : {}),
      ...(annualProjection?.eventCount === 2 && recurringCosts ? { recurringCosts } : {})
    });
    if (projection) return handled("pending", projection);

    const topicSwitch = await this.dependencies.readOnlyResponses.resolve({
      kind: "topic_switch", request, recentTurns, turnContext,
      pendingDecision: state.decision,
      ...(workflowState ? { workflowState } : {})
    });
    if (topicSwitch) return handled("pending", topicSwitch);

    if (approvalResponse === "ambiguous") {
      const response = await this.dependencies.readOnlyResponses.resolve({
        kind: "ambiguous_confirmation", request, recentTurns, turnContext,
        pendingDecision: state.decision,
        ...(workflowState ? { workflowState } : {})
      });
      return response ? handled("pending", response) : { kind: "unhandled" };
    }
    return { kind: "unhandled" };
  }
}

function handled(outcome: "approved" | "declined" | "pending", response: AgentResponse): PendingSavingsConfirmationOutcome {
  return Object.freeze({ kind: "handled", outcome, response });
}
