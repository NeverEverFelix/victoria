import { annualizeMonthlyAmountCents } from "../domain/money.js";
import type { TurnContext } from "./turn-context.js";
import type { ConversationalMemory } from "./memory/types.js";
import type { ActiveSavingsConversationState, ConversationWorkflowState } from "./conversation-state-manager.js";
import type { SavingsEvent } from "../domain/savings/types.js";
import {
  resolveActiveSavingsEventReference,
  resolveActiveSavingsProposalReference
} from "./conversation-state-manager.js";

export interface ContextFinancialFact {
  readonly id: string;
  readonly amountCents: number;
  readonly currency: "USD";
  readonly period: "monthly" | "annual";
  readonly meaning: "user_reported_recurring_cost" | "conditional_projection";
  readonly provenance: "user_statement" | "derived";
  readonly evidenceTurnIndexes: readonly number[];
  readonly derivedFromFactId?: string;
  readonly condition?: string;
}

export interface ActiveSavingsWorkflowContext {
  readonly actionId: string;
  readonly proposalId: string;
  readonly eventId: string;
  readonly status: ActiveSavingsConversationState["status"];
  readonly pendingRecordableAmountCents: number;
  readonly awaitingValidRevision?: boolean;
  readonly sourceEvent?: ActiveSavingsConversationState["sourceEvent"];
  readonly planningChoice?: ActiveSavingsConversationState["planningChoice"];
  readonly currentMessageReference?: {
    readonly eventId: string;
    readonly matchedBy: "merchant_name" | "source_summary";
  };
  readonly currentMessageProposalReference?: {
    readonly actionId: string;
    readonly proposalId: string;
    readonly eventId: string;
    readonly matchedBy: "proposal_language" | "source_event" | "revision_follow_up";
  };
  readonly selectedPlanningPeriod?: "monthly" | "annual";
  readonly selectedPlanningAmountCents?: number;
  readonly selectedPlanningMeaning?: "current_period_amount" | "conditional_projection";
  readonly integrity: "consistent" | "amount_mismatch" | "invalid_choice";
}

export type ConversationWorkflowContext = ActiveSavingsWorkflowContext | Extract<ConversationWorkflowState, { status: "awaiting_amount" }>;

export interface ResolvedFinancialReference {
  readonly factId: string;
  readonly amountCents: number;
  readonly currency: "USD";
  readonly period: "monthly" | "annual";
  readonly meaning: ContextFinancialFact["meaning"];
  readonly provenance: ContextFinancialFact["provenance"];
  readonly condition?: string;
}

export interface SelectedMemoryContextFact {
  readonly id: string;
  readonly category: ConversationalMemory["category"];
  readonly key: string;
  readonly value: string;
  readonly evidence: string;
  readonly provenance: "user_statement" | "user_correction";
}

export interface ConversationSavingsEventContext {
  readonly eventId: string;
  readonly type: SavingsEvent["type"];
  readonly summary: string;
  readonly merchantName?: string;
  readonly userProvidedAmountCents?: number;
  readonly provenance: "user_reported_event";
  readonly occurredAt: string;
}

/** Curated, read-only context assembled for specialist reasoning. */
export interface VictoriaConversationContext {
  readonly relevantUserTurns: readonly {
    readonly sourceTurnIndex: number;
    readonly text: string;
  }[];
  readonly financialFacts: readonly ContextFinancialFact[];
  /** Retrieved durable memories included as historical context, never as current-turn approval. */
  readonly selectedMemoryFacts: readonly SelectedMemoryContextFact[];
  /** Authoritative events recorded for this exact user and conversation; read-only context, never approval. */
  readonly conversationSavingsEvents: readonly ConversationSavingsEventContext[];
  /** Read-only state for an avoided-spend event waiting on a user-provided amount. */
  readonly workflowState?: ConversationWorkflowContext;
}

/** Validate a model-selected reference against the exact facts supplied in context. */
export function resolveFinancialReferenceHint(
  context: VictoriaConversationContext | undefined,
  hint: { readonly factId: string; readonly period: "monthly" | "annual" } | undefined
): ResolvedFinancialReference | undefined {
  if (!context || !hint || hint.factId.length > 120) return undefined;
  const fact = context.financialFacts.find((item) => item.id === hint.factId && item.period === hint.period);
  if (!fact || fact.currency !== "USD" || !Number.isSafeInteger(fact.amountCents) || fact.amountCents <= 0) return undefined;
  return Object.freeze({
    factId: fact.id,
    amountCents: fact.amountCents,
    currency: fact.currency,
    period: fact.period,
    meaning: fact.meaning,
    provenance: fact.provenance,
    ...(fact.condition ? { condition: fact.condition } : {})
  });
}

type RelevantUserTurn = VictoriaConversationContext["relevantUserTurns"][number];

/**
 * Assemble only the recent evidence and active proposal state relevant to a
 * financial turn. Transcript text remains evidence, never approval or policy.
 */
export function buildVictoriaConversationContext(input: {
  readonly priorTurns: readonly string[];
  readonly turnContext: TurnContext;
  readonly message?: string;
  readonly selectedMemories?: readonly ConversationalMemory[];
  readonly savingsEvents?: readonly SavingsEvent[];
  readonly workflowState?: ConversationWorkflowState;
}): VictoriaConversationContext {
  const relevantUserTurns: RelevantUserTurn[] = [];
  const facts: ContextFinancialFact[] = [];
  const seenTurnIndexes = new Set<number>();

  for (const cost of input.turnContext.recurringCosts.slice(-4)) {
    const text = cost.sourceText.trim().slice(0, 800);
    if (!text || text.startsWith("Victoria: ") || !Number.isSafeInteger(cost.monthlyAmountCents) ||
        cost.monthlyAmountCents <= 0 || !Number.isSafeInteger(cost.monthlyAmountCents * 12)) continue;
    const sourceTurnIndex = cost.sourceTurnIndex;
    const monthlyFactId = `turn:${sourceTurnIndex}:monthly-recurring-cost`;
    facts.push({
      id: monthlyFactId,
      amountCents: cost.monthlyAmountCents,
      currency: "USD",
      period: "monthly",
      meaning: "user_reported_recurring_cost",
      provenance: "user_statement",
      evidenceTurnIndexes: [sourceTurnIndex]
    });
    facts.push({
      id: `turn:${sourceTurnIndex}:annual-projection`,
      amountCents: annualizeMonthlyAmountCents(cost.monthlyAmountCents),
      currency: "USD",
      period: "annual",
      meaning: "conditional_projection",
      provenance: "derived",
      evidenceTurnIndexes: [sourceTurnIndex],
      derivedFromFactId: monthlyFactId,
      condition: "Only if this monthly cost remains out of the budget for 12 months."
    });
    if (!seenTurnIndexes.has(sourceTurnIndex)) {
      relevantUserTurns.push({ sourceTurnIndex, text });
      seenTurnIndexes.add(sourceTurnIndex);
    }
  }

  const workflowState = input.workflowState?.status === "awaiting_confirmation"
    ? buildActiveWorkflow(input.workflowState, input.message ?? "")
    : input.workflowState;

  return Object.freeze({
    relevantUserTurns: Object.freeze(relevantUserTurns),
    financialFacts: Object.freeze(facts),
    selectedMemoryFacts: Object.freeze(selectMemoryFacts(input.selectedMemories ?? [])),
    conversationSavingsEvents: Object.freeze(selectConversationSavingsEvents(input.savingsEvents ?? [])),
    ...(workflowState ? { workflowState } : {})
  });
}

function selectConversationSavingsEvents(events: readonly SavingsEvent[]): ConversationSavingsEventContext[] {
  return events.filter((event) => event.type === "avoided_spend" && event.id.trim() && event.userId.trim() &&
      event.summary.trim() && event.summary.length <= 500 && Number.isFinite(Date.parse(event.createdAt)) &&
      (event.userProvidedAmountCents === undefined ||
        (Number.isSafeInteger(event.userProvidedAmountCents) && event.userProvidedAmountCents > 0)))
    .slice(-8)
    .map((event) => {
      const merchantName = event.merchantName?.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
      const summary = event.summary.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
      return Object.freeze({
        eventId: event.id,
        type: event.type,
        summary,
        ...(merchantName ? { merchantName } : {}),
        ...(event.userProvidedAmountCents !== undefined ? { userProvidedAmountCents: event.userProvidedAmountCents } : {}),
        provenance: "user_reported_event" as const,
        occurredAt: event.createdAt
      });
    }).filter((event) => event.summary.length > 0);
}

function selectMemoryFacts(memories: readonly ConversationalMemory[]): SelectedMemoryContextFact[] {
  return memories.flatMap((memory) => {
    if ((memory.sourceType !== "user_statement" && memory.sourceType !== "user_correction") ||
        memory.sourceMetadata?.interestStatus === "inactive" ||
        !Number.isFinite(memory.confidence) || memory.confidence < 0.85) return [];
    const id = memory.id.trim();
    const key = memory.key.trim();
    const value = memory.value.trim();
    const evidence = memory.evidence.trim();
    if (!id || id.length > 120 || !key || key.length > 80 || !value || value.length > 240 ||
        !evidence || evidence.length > 240) return [];
    return [{
      id,
      category: memory.category,
      key,
      value,
      evidence,
      provenance: memory.sourceType
    }];
  }).slice(0, 6);
}

function buildActiveWorkflow(
  input: ActiveSavingsConversationState,
  message: string
): ActiveSavingsWorkflowContext {
  const choice = input.planningChoice ? {
    monthlyAmountCents: input.planningChoice.monthlyAmountCents,
    annualProjectionCents: input.planningChoice.annualProjectionCents,
    selectedHorizon: input.planningChoice.selectedPeriod
  } : undefined;
  const pendingAmount = input.pendingRecordableAmountCents;
  const hasPendingAmount = pendingAmount !== undefined && Number.isSafeInteger(pendingAmount) && pendingAmount > 0;
  const sourceEvent = validSourceEvent(input.sourceEvent).sourceEvent;
  const referenceState = sourceEvent && input.actionId && input.proposalId && input.eventId ? {
    actionId: input.actionId,
    proposalId: input.proposalId,
    eventId: input.eventId,
    sourceEvent,
    ...(input.awaitingValidRevision ? { awaitingValidRevision: true } : {})
  } : undefined;
  const currentMessageReference = sourceEvent
    ? resolveActiveSavingsEventReference(message, { eventId: sourceEvent.id, sourceEvent })
    : undefined;
  const currentMessageProposalReference = referenceState
    ? resolveActiveSavingsProposalReference(message, referenceState)
    : undefined;
  const sourceContext = {
    ...(sourceEvent ? { sourceEvent } : {}),
    ...(currentMessageReference ? { currentMessageReference } : {}),
    ...(currentMessageProposalReference ? { currentMessageProposalReference } : {})
  };
  const identityContext = {
    actionId: input.actionId,
    proposalId: input.proposalId,
    eventId: input.eventId,
    status: input.status,
    pendingRecordableAmountCents: pendingAmount,
    ...(input.awaitingValidRevision ? { awaitingValidRevision: true } : {})
  };
  if (!choice) {
    return {
      ...identityContext,
      ...sourceContext,
      integrity: hasPendingAmount || pendingAmount === undefined ? "consistent" : "amount_mismatch"
    };
  }

  const validChoice = Number.isSafeInteger(choice.monthlyAmountCents) && choice.monthlyAmountCents > 0 &&
    Number.isSafeInteger(choice.monthlyAmountCents * 12) &&
    choice.annualProjectionCents === annualizeMonthlyAmountCents(choice.monthlyAmountCents);
  if (!validChoice) return { ...identityContext, ...sourceContext, integrity: "invalid_choice" };
  if (hasPendingAmount && pendingAmount !== choice.monthlyAmountCents) {
    return { ...identityContext, ...sourceContext, integrity: "amount_mismatch" };
  }

  const selectedPlanningPeriod = choice.selectedHorizon;
  const selectedPlanningAmountCents = selectedPlanningPeriod === "annual"
    ? choice.annualProjectionCents
    : selectedPlanningPeriod === "monthly" ? choice.monthlyAmountCents : undefined;
  return {
    ...identityContext,
    ...sourceContext,
    ...(input.planningChoice ? { planningChoice: input.planningChoice } : {}),
    ...(selectedPlanningPeriod ? { selectedPlanningPeriod } : {}),
    ...(selectedPlanningAmountCents === undefined ? {} : {
      selectedPlanningAmountCents,
      selectedPlanningMeaning: selectedPlanningPeriod === "annual"
        ? "conditional_projection" as const
        : "current_period_amount" as const
    }),
    integrity: "consistent"
  };
}

function validSourceEvent(sourceEvent: ActiveSavingsConversationState["sourceEvent"] | undefined):
  { sourceEvent?: NonNullable<ActiveSavingsWorkflowContext["sourceEvent"]> } {
  if (!sourceEvent || !sourceEvent.id.trim() || sourceEvent.id.length > 120 ||
      sourceEvent.summaryProvenance !== "validated_event_summary") return {};
  const summary = sourceEvent.summary.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 500);
  const merchantName = sourceEvent.merchantName?.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
  if (!summary) return {};
  return {
    sourceEvent: {
      id: sourceEvent.id,
      summary,
      summaryProvenance: "validated_event_summary",
      ...(merchantName ? { merchantName } : {}),
      ...(Number.isSafeInteger(sourceEvent.userProvidedAmountCents) && sourceEvent.userProvidedAmountCents! > 0
        ? { userProvidedAmountCents: sourceEvent.userProvidedAmountCents }
        : {})
    }
  };
}
