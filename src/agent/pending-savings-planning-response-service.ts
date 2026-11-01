import { formatUsd } from "../domain/money.js";
import { revisePlanningState } from "./conversation-state-manager.js";
import { resolvePlanningReference } from "./planning-reference-resolver.js";
import type { ActiveSavingsConversationState } from "./conversation-state-manager.js";
import { answerRecurringProjectionQuestion, describeAnnualProjection, describeCombinedProjectionAndClarifyRecordTarget, isCurrentMonthRecordRequest } from "./planning-response-policy.js";
import { freedRecurringSpend } from "./money-movement-intent.js";
import type { PendingSavingsProposalService, PendingSavingsProposalState } from "./pending-savings-proposal-service.js";
import type { AgentRequest, AgentResponse } from "./types.js";

/** Resolves a planning-period reply against the existing pending proposal without authorizing it. */
export class PendingSavingsPlanningResponseService {
  constructor(private readonly proposals: PendingSavingsProposalService) {}

  resolveChoice(input: {
    readonly request: AgentRequest;
    readonly actionId: string;
    readonly pending: PendingSavingsProposalState;
    readonly workflowState?: ActiveSavingsConversationState;
  }): AgentResponse | undefined {
    const { request, actionId, pending, workflowState } = input;
    const choice = pending.decision.planningChoice;
    if (!choice || pending.userId !== request.userId || workflowState?.actionId !== actionId ||
        workflowState.proposalId !== pending.decision.proposal?.id) return undefined;
    const planningReference = resolvePlanningReference({ message: request.message, choice });
    const horizon = planningReference.kind === "resolved" ? planningReference.period : undefined;
    const planningTransition = revisePlanningState(workflowState, planningReference);
    if (planningReference.kind === "resolved" && horizon &&
        (planningTransition.kind === "revised" ||
          (planningTransition.kind === "unchanged" && horizon === "monthly"))) {
      const selectedAmount = planningTransition.state.planningChoice?.selectedAmountCents ?? planningReference.amountCents;
      const message = horizon === "annual"
        ? `Got it: ${formatUsd(selectedAmount)} is the yearly target you'd like to work toward, based on ${formatUsd(choice.monthlyAmountCents)} a month if your gym stays covered. I can start by recording this month's ${formatUsd(choice.monthlyAmountCents)} in your Victoria savings ledger. Say yes to confirm. No real money moves.`
        : `Got it: ${formatUsd(selectedAmount)} is the monthly target. I can record this month's ${formatUsd(choice.monthlyAmountCents)} in your Victoria savings ledger. Say yes to confirm. No real money moves.`;
      const decision = {
        ...pending.decision,
        planningChoice: { ...choice, selectedHorizon: horizon },
        userFacingMessage: message
      };
      this.proposals.set(actionId, { ...pending, decision });
      return { message, decision };
    }

    if (horizon === "annual" && choice.selectedHorizon === "annual" && planningReference.kind === "resolved") {
      const message = `Right, you're planning around ${formatUsd(choice.annualProjectionCents)} a year. That assumes ${formatUsd(choice.monthlyAmountCents)} stays freed up each month for 12 months. I can record this month's ${formatUsd(choice.monthlyAmountCents)} toward that target after you confirm. Say yes to record it in your Victoria savings ledger; no real money moves.`;
      return { message, decision: {
        ...pending.decision,
        planningChoice: choice,
        action: "ask_follow_up",
        userFacingMessage: message
      } };
    }

    if (choice.selectedHorizon === "annual" && /\b(?:future target|target for the future|future goal)\b/i.test(request.message)) {
      const message = `Exactly—the ${formatUsd(choice.annualProjectionCents)} is a future yearly target, not money already saved. I can start by recording this month's ${formatUsd(choice.monthlyAmountCents)} toward it. Say yes to confirm; no real money moves.`;
      return { message, decision: { ...pending.decision, action: "ask_follow_up", userFacingMessage: message } };
    }
    return undefined;
  }

  resolveProjection(input: {
    readonly request: AgentRequest;
    readonly pending: PendingSavingsProposalState;
    readonly recentTurns: readonly string[];
    readonly annualProjection?: { readonly monthlyAmountCents: number; readonly annualAmountCents: number; readonly eventCount: number };
    readonly recurringCosts?: readonly { readonly monthlyAmountCents: number }[];
  }): AgentResponse | undefined {
    const { request, pending, recentTurns, annualProjection, recurringCosts } = input;
    if (pending.userId !== request.userId) return undefined;
    if (annualProjection?.eventCount === 1 && isCurrentMonthRecordRequest(request.message) &&
        pending.decision.suggestion?.amountCents === annualProjection.monthlyAmountCents) {
      const message = `That would be ${formatUsd(annualProjection.annualAmountCents)} over 12 months if the expense stays out of your budget. The pending mocked ledger suggestion is ${formatUsd(annualProjection.monthlyAmountCents)} for this month. Say yes to confirm recording that amount; no real money moves.`;
      return { message, decision: { ...pending.decision, action: "ask_follow_up", userFacingMessage: message } };
    }

    const planningAnswer = answerRecurringProjectionQuestion(
      request.message,
      pending.decision.planningChoice?.monthlyAmountCents ??
        [...recentTurns].reverse().map(freedRecurringSpend).find((spend) => spend?.cadence === "month")?.amountCents,
      pending.decision.suggestion?.amountCents
    );
    if (planningAnswer) {
      return { message: planningAnswer, decision: {
        action: "reflect",
        classification: { type: "general_finance", confidence: 1, summary: request.message, needsClarification: false },
        userFacingMessage: planningAnswer
      } };
    }

    if (annualProjection?.eventCount === 2 && isCurrentMonthRecordRequest(request.message)) {
      const message = describeCombinedProjectionAndClarifyRecordTarget(
        annualProjection, recurringCosts, pending.decision.suggestion?.amountCents
      );
      return { message, decision: {
        action: "ask_follow_up",
        classification: { type: "unclear", confidence: 1, summary: request.message, needsClarification: true },
        userFacingMessage: message,
        ...(pending.decision.proposal ? { proposal: pending.decision.proposal } : {})
      } };
    }
    if (annualProjection?.eventCount === 2) {
      const message = describeAnnualProjection(annualProjection);
      return { message, decision: {
        action: "reflect",
        classification: { type: "general_finance", confidence: 1, summary: request.message, needsClarification: false },
        userFacingMessage: message
      } };
    }
    return undefined;
  }
}
