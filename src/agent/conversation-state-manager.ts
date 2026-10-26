import type { PlanningReferenceResolution } from "./planning-reference-resolver.js";
import type { PendingAmountClarification } from "./pending-amount-clarification-store.js";
import type { AgentDecision } from "./types.js";

export interface AwaitingAmountConversationState {
  readonly status: "awaiting_amount";
  readonly eventId: string;
  readonly missingInformation: "amount";
  readonly sourceEvent: {
    readonly id: string;
    readonly summary: string;
    readonly summaryProvenance: "validated_event_summary";
    readonly merchantName?: string;
  };
}

export interface ActiveSavingsConversationState {
  readonly actionId: string;
  readonly proposalId: string;
  readonly eventId: string;
  readonly status: "awaiting_confirmation";
  readonly pendingRecordableAmountCents: number;
  readonly awaitingValidRevision?: boolean;
  readonly awaitingRevisionTarget?: boolean;
  readonly sourceEvent: {
    readonly id: string;
    readonly summary: string;
    readonly summaryProvenance: "validated_event_summary";
    readonly merchantName?: string;
    readonly userProvidedAmountCents?: number;
  };
  readonly planningChoice?: {
    readonly monthlyAmountCents: number;
    readonly annualProjectionCents: number;
    readonly selectedPeriod?: "monthly" | "annual";
    readonly selectedAmountCents?: number;
    readonly targetType?: "current_period_amount" | "conditional_projection";
  };
}

export type ConversationWorkflowState = AwaitingAmountConversationState | ActiveSavingsConversationState;

/** Select one authoritative workflow for specialist context. A proposal awaiting confirmation takes precedence. */
export function selectConversationWorkflowState(input: {
  readonly awaitingAmount?: AwaitingAmountConversationState;
  readonly awaitingConfirmation?: ActiveSavingsConversationState;
}): ConversationWorkflowState | undefined {
  return input.awaitingConfirmation ?? input.awaitingAmount;
}

export type PlanningStateTransition =
  | { readonly kind: "unavailable" }
  | { readonly kind: "unchanged"; readonly state: ActiveSavingsConversationState }
  | { readonly kind: "revised"; readonly state: ActiveSavingsConversationState };

export interface ActiveSavingsEventReference {
  readonly eventId: string;
  readonly matchedBy: "merchant_name" | "source_summary";
}

export interface ActiveSavingsProposalReference {
  readonly actionId: string;
  readonly proposalId: string;
  readonly eventId: string;
  readonly matchedBy: "proposal_language" | "source_event" | "revision_follow_up";
}

/** Build explicit workflow state for an avoided-spend event waiting on an amount. */
export function buildAwaitingAmountConversationState(
  userId: string,
  clarification: PendingAmountClarification | undefined
): AwaitingAmountConversationState | undefined {
  const event = clarification?.savingsEvent;
  if (!userId.trim() || clarification?.classification.type !== "avoided_spend" ||
      event?.type !== "avoided_spend" || event.userId !== userId || !event.id.trim() || !event.summary.trim() ||
      (event.userProvidedAmountCents !== undefined &&
        (!Number.isSafeInteger(event.userProvidedAmountCents) || event.userProvidedAmountCents <= 0))) return undefined;
  return Object.freeze({
    status: "awaiting_amount",
    eventId: event.id,
    missingInformation: "amount",
    sourceEvent: Object.freeze({
      id: event.id,
      summary: event.summary.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500),
      summaryProvenance: "validated_event_summary",
      ...(event.merchantName ? { merchantName: event.merchantName.slice(0, 120) } : {})
    })
  });
}

/** Build the typed, read-only state for a pending proposal without trusting transcript text. */
export function buildActiveSavingsConversationState(
  actionId: string,
  decision: AgentDecision,
  options: { readonly awaitingValidRevision?: boolean; readonly awaitingRevisionTarget?: boolean } = {}
): ActiveSavingsConversationState | undefined {
  const proposal = decision.proposal;
  const event = decision.savingsEvent;
  const recordableAmount = proposal?.suggestion.amountCents;
  if (!actionId || decision.toolCall?.actionId !== actionId || proposal?.status !== "pending" ||
      !proposal.id || !proposal.eventId || !event || event.id !== proposal.eventId ||
      !event.summary.trim() || !Number.isSafeInteger(recordableAmount) || recordableAmount! <= 0) return undefined;

  const choice = decision.planningChoice;
  if (choice && (!Number.isSafeInteger(choice.monthlyAmountCents) || choice.monthlyAmountCents <= 0 ||
      !Number.isSafeInteger(choice.annualProjectionCents) || choice.annualProjectionCents <= 0 ||
      !Number.isSafeInteger(choice.monthlyAmountCents * 12) ||
      choice.annualProjectionCents !== choice.monthlyAmountCents * 12 ||
      choice.monthlyAmountCents !== recordableAmount)) return undefined;

  return Object.freeze({
    actionId,
    proposalId: proposal.id,
    eventId: proposal.eventId,
    status: "awaiting_confirmation",
    pendingRecordableAmountCents: recordableAmount!,
    ...(options.awaitingValidRevision ? { awaitingValidRevision: true } : {}),
    ...(options.awaitingRevisionTarget ? { awaitingRevisionTarget: true } : {}),
    sourceEvent: Object.freeze({
      id: event.id,
      summary: event.summary.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500),
      summaryProvenance: "validated_event_summary",
      ...(event.merchantName ? { merchantName: event.merchantName.slice(0, 120) } : {}),
      ...(Number.isSafeInteger(event.userProvidedAmountCents) && event.userProvidedAmountCents! > 0
        ? { userProvidedAmountCents: event.userProvidedAmountCents }
        : {})
    }),
    ...(choice ? {
      planningChoice: Object.freeze({
        monthlyAmountCents: choice.monthlyAmountCents,
        annualProjectionCents: choice.annualProjectionCents,
        ...(choice.selectedHorizon ? {
          selectedPeriod: choice.selectedHorizon,
          selectedAmountCents: choice.selectedHorizon === "annual"
            ? choice.annualProjectionCents
            : choice.monthlyAmountCents,
          targetType: choice.selectedHorizon === "annual"
            ? "conditional_projection" as const
            : "current_period_amount" as const
        } : {})
      })
    } : {})
  });
}

/** Revise only the planning target; proposal identity and recordable amount stay fixed. */
export function revisePlanningState(
  state: ActiveSavingsConversationState | undefined,
  reference: PlanningReferenceResolution | undefined
): PlanningStateTransition {
  if (!state?.planningChoice || reference?.kind !== "resolved") return { kind: "unavailable" };
  const choice = state.planningChoice;
  const expectedAmount = reference.period === "annual" ? choice.annualProjectionCents : choice.monthlyAmountCents;
  const expectedType = reference.period === "annual" ? "conditional_projection" : "current_period_amount";
  if (!Number.isSafeInteger(reference.amountCents) || reference.amountCents !== expectedAmount ||
      reference.amountMeaning !== expectedType) {
    return { kind: "unavailable" };
  }
  if (choice.selectedPeriod === reference.period && choice.selectedAmountCents === expectedAmount &&
      choice.targetType === expectedType) return { kind: "unchanged", state };

  return {
    kind: "revised",
    state: Object.freeze({
      ...state,
      planningChoice: Object.freeze({
        ...choice,
        selectedPeriod: reference.period,
        selectedAmountCents: expectedAmount,
        targetType: expectedType
      })
    })
  };
}

/** Resolve an explicitly named reference only to the one active pending source event. */
export function resolveActiveSavingsEventReference(
  message: string,
  state: Pick<ActiveSavingsConversationState, "eventId" | "sourceEvent"> | undefined
): ActiveSavingsEventReference | undefined {
  const normalizedMessage = normalizeReferenceText(message);
  if (!state || !normalizedMessage || normalizedMessage.length > 180 ||
      /\b(?:either|both|compare|between|versus|vs|maybe|not sure|other|another|earlier|previous|prior|older|different)\b/.test(normalizedMessage)) return undefined;
  const hasExplicitReference = /\b(?:that|this|same|those|these|one|it)\b/.test(normalizedMessage) ||
    /\b(?:record|log|save|revise|change|update|confirm)\b/.test(normalizedMessage);
  if (!hasExplicitReference) return undefined;

  const messageTokens = new Set(referenceTokens(normalizedMessage));
  const merchantTokens = referenceTokens(state.sourceEvent.merchantName ?? "");
  if (merchantTokens.some((token) => messageTokens.has(token))) {
    return Object.freeze({ eventId: state.eventId, matchedBy: "merchant_name" });
  }
  const sourceTokens = referenceTokens(state.sourceEvent.summary);
  if (sourceTokens.some((token) => messageTokens.has(token))) {
    return Object.freeze({ eventId: state.eventId, matchedBy: "source_summary" });
  }
  return undefined;
}

/** Resolve explicit revision language to the one active proposal, without implying approval. */
export function resolveActiveSavingsProposalReference(
  message: string,
  state: Pick<ActiveSavingsConversationState, "actionId" | "proposalId" | "eventId" | "sourceEvent"> &
    Partial<Pick<ActiveSavingsConversationState, "awaitingValidRevision" | "awaitingRevisionTarget">> | undefined
): ActiveSavingsProposalReference | undefined {
  const normalizedMessage = normalizeReferenceText(message);
  if (!state || !normalizedMessage || normalizedMessage.length > 180 ||
      /\b(?:either|both|compare|between|versus|vs|maybe|not sure|other|another|earlier|previous|prior|older|different)\b/.test(normalizedMessage)) return undefined;
  if (state.awaitingRevisionTarget) return undefined;
  if (hasMismatchedSourceDescriptor(message, state.sourceEvent)) return undefined;

  if (state.awaitingValidRevision && isExplicitRevisionAmountReply(message)) {
    return Object.freeze({
      actionId: state.actionId,
      proposalId: state.proposalId,
      eventId: state.eventId,
      matchedBy: "revision_follow_up"
    });
  }

  const hasRevisionCue = /\b(?:actually|change|changed|correct|correction|fix|make|revise|revision|update|replace|instead)\b/.test(normalizedMessage);
  if (!hasRevisionCue) return undefined;

  const hasProposalTarget = /\b(?:that|this|it|current|pending|proposal|suggestion|amount|reason|currency|goal)\b/.test(normalizedMessage);
  if (hasProposalTarget) {
    return Object.freeze({
      actionId: state.actionId,
      proposalId: state.proposalId,
      eventId: state.eventId,
      matchedBy: "proposal_language"
    });
  }

  const eventReference = resolveActiveSavingsEventReference(message, state);
  if (!eventReference) return undefined;
  return Object.freeze({
    actionId: state.actionId,
    proposalId: state.proposalId,
    eventId: state.eventId,
    matchedBy: "source_event"
  });
}

function isExplicitRevisionAmountReply(message: string): boolean {
  const amount = String.raw`\$\s*(?:\d{1,3}(?:,\d{3})+|\d+)(?:\.\d{1,2})?`;
  return new RegExp(`^\\s*(?:(?:use|make it|set it to|it was|the amount is)\\s+)?${amount}[.!]?\\s*$`, "i")
    .test(message);
}

function hasMismatchedSourceDescriptor(
  message: string,
  sourceEvent: ActiveSavingsConversationState["sourceEvent"]
): boolean {
  const eventCue = /\b(?:purchase|expense|event|spend|bill|charge|membership|subscription|gym|jacket|coffee|pastry|service|order|meal)\b/i;
  if (!eventCue.test(message)) return false;
  const control = new Set([
    "about", "actually", "amount", "annual", "annually", "change", "changed", "correct", "correction",
    "current", "fix", "goal", "make", "monthly", "pending", "proposal", "reason", "record", "revise",
    "revision", "save", "suggestion", "target", "update", "replace", "instead", "use", "to", "it", "that",
    "this", "my", "the", "please", "set", "was", "is", "or", "and", "a", "an", "purchase", "expense",
    "event", "spend", "bill", "charge", "membership", "subscription", "service", "order", "meal"
  ]);
  const sourceTokens = new Set([
    ...referenceTokens(sourceEvent.summary),
    ...referenceTokens(sourceEvent.merchantName ?? "")
  ]);
  return referenceTokens(message).some((token) =>
    !/^\d+$/.test(token) && !control.has(token) && !sourceTokens.has(token)
  );
}

function normalizeReferenceText(value: string): string {
  return value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, " ").trim();
}

function referenceTokens(value: string): string[] {
  const generic = new Set([
    "about", "after", "amount", "annual", "annually", "are", "around", "because", "before", "could",
    "cost", "costs", "covered", "coverage", "decided", "did", "do", "does", "dollar", "dollars",
    "expense", "expenses", "for", "from", "get", "got", "had", "have", "how", "i", "if",
    "in", "is", "it", "its", "just", "make", "membership", "monthly", "month", "months", "my",
    "now", "of", "on", "or", "out", "pay", "paid", "paying", "per", "record", "same", "save",
    "saved", "saving", "savings", "should", "spent", "subscription", "that", "the", "this", "to",
    "was", "were", "what", "when", "which", "with", "would", "year", "yearly", "years", "you"
  ]);
  return normalizeReferenceText(value).split(" ").filter((token) => token.length >= 3 && !generic.has(token));
}
