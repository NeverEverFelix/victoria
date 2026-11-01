import { annualizeMonthlyAmountCents } from "../domain/money.js";
import { parseExplicitDollarAmount } from "../domain/financial-events/parse-explicit-amount.js";
import { freedRecurringSpend } from "./money-movement-intent.js";
import type { ContextReferenceResolution } from "./context-reference-resolver.js";

export interface RecurringCostContext {
  readonly sourceTurnIndex: number;
  readonly sourceText: string;
  readonly monthlyAmountCents: number;
}

export interface TurnContext {
  readonly recurringCosts: readonly RecurringCostContext[];
  readonly annualProjectionRequested: boolean;
  readonly combinedReferenceRequested: boolean;
  readonly annualProjection?: {
    readonly monthlyAmountCents: number;
    readonly annualAmountCents: number;
    readonly eventCount: number;
  };
  readonly unresolvedCombinedProjection: boolean;
  readonly possibleRecordedRepeatAmountCents?: number;
  readonly followUpAfterDecline?: string;
}

/**
 * Read-only, conservative context assembled from this conversation's recent
 * turns. Transcript-derived records are hints, never approval or ledger proof.
 */
export function buildTurnContext(input: {
  readonly message: string;
  readonly priorTurns: readonly string[];
}): TurnContext {
  const { message, priorTurns } = input;
  const recurringCosts: RecurringCostContext[] = [];
  for (const [sourceTurnIndex, sourceText] of [...priorTurns, message].entries()) {
    if (sourceText.startsWith("Victoria: ")) continue;
    const spend = freedRecurringSpend(sourceText);
    if (spend?.cadence !== "month" || !Number.isSafeInteger(spend.amountCents * 12)) continue;
    recurringCosts.push({ sourceTurnIndex, sourceText, monthlyAmountCents: spend.amountCents });
  }

  const asksAnnualProjection = /\b(?:annual|annually|year|yearly|12\s+months|twelve\s+months)\b/i.test(message) &&
    /\b(?:what|how|calculate|show|tell|answer|project|projection|math|add up|total)\b/i.test(message);
  const asksCombined = /\b(?:both|combined|together|all of (?:that|those|them))\b/i.test(message);
  const currentHasCost = recurringCosts.some((cost) => cost.sourceTurnIndex === priorTurns.length);
  const selectedCosts = asksCombined ? recurringCosts : currentHasCost ? [] : recurringCosts;
  const projectionIsGrounded = asksAnnualProjection && selectedCosts.length === (asksCombined ? 2 : 1);
  const monthlyAmountCents = projectionIsGrounded
    ? selectedCosts.reduce((total, cost) => total + cost.monthlyAmountCents, 0)
    : undefined;
  const annualProjection = monthlyAmountCents !== undefined && Number.isSafeInteger(monthlyAmountCents * 12)
    ? { monthlyAmountCents, annualAmountCents: annualizeMonthlyAmountCents(monthlyAmountCents), eventCount: selectedCosts.length }
    : undefined;

  return {
    recurringCosts,
    annualProjectionRequested: asksAnnualProjection,
    combinedReferenceRequested: asksCombined,
    ...(annualProjection ? { annualProjection } : {}),
    unresolvedCombinedProjection: asksAnnualProjection && asksCombined && !annualProjection,
    ...possibleRecordedRepeat(message, priorTurns),
    ...readOnlyRequestAfterDecline(message)
  };
}

/** A model may select references, but arithmetic and event membership stay in code. */
export function projectionFromResolvedReferences(
  context: TurnContext,
  resolution: ContextReferenceResolution
): TurnContext["annualProjection"] {
  if (!context.annualProjectionRequested || resolution.kind !== "annual_projection" ||
      resolution.confidence < 0.8 || resolution.sourceTurnIndexes.length < 1 ||
      resolution.sourceTurnIndexes.length > 2 ||
      (context.combinedReferenceRequested && resolution.sourceTurnIndexes.length !== 2) ||
      new Set(resolution.sourceTurnIndexes).size !== resolution.sourceTurnIndexes.length) return;
  const byIndex = new Map(context.recurringCosts.map((cost) => [cost.sourceTurnIndex, cost]));
  const selected = resolution.sourceTurnIndexes.map((index) => byIndex.get(index));
  if (selected.some((event) => event === undefined)) return;
  const monthlyAmountCents = selected.reduce((total, event) => total + event!.monthlyAmountCents, 0);
  if (!Number.isSafeInteger(monthlyAmountCents) || !Number.isSafeInteger(monthlyAmountCents * 12)) return;
  return {
    monthlyAmountCents,
    annualAmountCents: annualizeMonthlyAmountCents(monthlyAmountCents),
    eventCount: selected.length
  };
}

function possibleRecordedRepeat(message: string, priorTurns: readonly string[]): {
  possibleRecordedRepeatAmountCents?: number;
} {
  if (/\?/.test(message) || /\b(?:another|new|different|second|next|again today)\b/i.test(message)) return {};
  const requested = parseExplicitDollarAmount(message);
  if (requested.status !== "valid") return {};
  if (!/\b(?:record|log|save|add|skipped|avoided|instead of)\b/i.test(message)) return {};
  const recordedAmounts = priorTurns.flatMap((turn) => {
    const amountText = turn.match(/^Victoria: Done\. I recorded (\$[\d,]+(?:\.\d{2})?)/)?.[1];
    if (!amountText) return [];
    const amount = parseExplicitDollarAmount(amountText);
    return amount.status === "valid" ? [amount.amountCents] : [];
  });
  return recordedAmounts.includes(requested.amountCents)
    ? { possibleRecordedRepeatAmountCents: requested.amountCents } : {};
}

function readOnlyRequestAfterDecline(message: string): { followUpAfterDecline?: string } {
  const refusal = /^(?:no|nope|nah)\b|\b(?:don't|do not)\s+(?:record|log|save|add)\b/i.test(message);
  if (!refusal) return {};
  const explicitRequest = message.match(/\b(?:just\s+)?(?:answer|tell me|explain|show me)\b[\s\S]*$/i)?.[0];
  if (explicitRequest) return { followUpAfterDecline: explicitRequest.trim() };
  const question = message.match(/[.!?]\s*([^.!?]+\?)\s*$/s)?.[1];
  return question ? { followUpAfterDecline: question.trim() } : {};
}
