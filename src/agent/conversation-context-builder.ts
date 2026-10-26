import { annualizeMonthlyAmountCents } from "../domain/money.js";
import type { PendingPlanningChoice } from "./planning-reference-resolver.js";
import type { TurnContext } from "./turn-context.js";

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
  readonly status: "awaiting_confirmation";
  readonly pendingRecordableAmountCents?: number;
  readonly selectedPlanningPeriod?: "monthly" | "annual";
  readonly selectedPlanningAmountCents?: number;
  readonly selectedPlanningMeaning?: "current_period_amount" | "conditional_projection";
  readonly integrity: "consistent" | "amount_mismatch" | "invalid_choice";
}

export interface ResolvedFinancialReference {
  readonly factId: string;
  readonly amountCents: number;
  readonly currency: "USD";
  readonly period: "monthly" | "annual";
  readonly meaning: ContextFinancialFact["meaning"];
  readonly provenance: ContextFinancialFact["provenance"];
  readonly condition?: string;
}

/** Curated, read-only context assembled for specialist reasoning. */
export interface VictoriaConversationContext {
  readonly relevantUserTurns: readonly {
    readonly sourceTurnIndex: number;
    readonly text: string;
  }[];
  readonly financialFacts: readonly ContextFinancialFact[];
  readonly activeSavingsWorkflow?: ActiveSavingsWorkflowContext;
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
  readonly activeWorkflow?: {
    readonly pendingRecordableAmountCents?: number;
    readonly planningChoice?: PendingPlanningChoice;
  };
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

  const activeSavingsWorkflow = input.activeWorkflow
    ? buildActiveWorkflow(input.activeWorkflow)
    : undefined;

  return Object.freeze({
    relevantUserTurns: Object.freeze(relevantUserTurns),
    financialFacts: Object.freeze(facts),
    ...(activeSavingsWorkflow ? { activeSavingsWorkflow } : {})
  });
}

function buildActiveWorkflow(input: NonNullable<Parameters<typeof buildVictoriaConversationContext>[0]["activeWorkflow"]>): ActiveSavingsWorkflowContext {
  const choice = input.planningChoice;
  const pendingAmount = input.pendingRecordableAmountCents;
  const hasPendingAmount = pendingAmount !== undefined && Number.isSafeInteger(pendingAmount) && pendingAmount > 0;
  if (!choice) {
    return {
      status: "awaiting_confirmation",
      ...(hasPendingAmount ? { pendingRecordableAmountCents: pendingAmount } : {}),
      integrity: hasPendingAmount || pendingAmount === undefined ? "consistent" : "amount_mismatch"
    };
  }

  const validChoice = Number.isSafeInteger(choice.monthlyAmountCents) && choice.monthlyAmountCents > 0 &&
    Number.isSafeInteger(choice.monthlyAmountCents * 12) &&
    choice.annualProjectionCents === annualizeMonthlyAmountCents(choice.monthlyAmountCents);
  if (!validChoice) return { status: "awaiting_confirmation", integrity: "invalid_choice" };
  if (hasPendingAmount && pendingAmount !== choice.monthlyAmountCents) {
    return { status: "awaiting_confirmation", integrity: "amount_mismatch" };
  }

  const selectedPlanningPeriod = choice.selectedHorizon;
  const selectedPlanningAmountCents = selectedPlanningPeriod === "annual"
    ? choice.annualProjectionCents
    : selectedPlanningPeriod === "monthly" ? choice.monthlyAmountCents : undefined;
  return {
    status: "awaiting_confirmation",
    ...(hasPendingAmount ? { pendingRecordableAmountCents: pendingAmount } : {}),
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
