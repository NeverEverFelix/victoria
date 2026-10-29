import { annualizeMonthlyAmountCents } from "../domain/money.js";
import { parseExplicitDollarAmount } from "../domain/financial-events/parse-explicit-amount.js";

export interface PendingPlanningChoice {
  readonly monthlyAmountCents: number;
  readonly annualProjectionCents: number;
  readonly selectedHorizon?: "monthly" | "annual";
}

export type PlanningReferenceResolution =
  | { readonly kind: "not_a_reference" }
  | {
      readonly kind: "resolved";
      readonly period: "monthly" | "annual";
      readonly amountCents: number;
      readonly amountMeaning: "current_period_amount" | "conditional_projection";
      readonly operation: "select_target" | "request_recording";
    }
  | { readonly kind: "unresolved"; readonly reason: "conflicting_periods" | "amount_mismatch" | "invalid_context" };

const PERIOD_SELECTION = /\b(?:prefer|choose|pick|select|use|want|like|rather|go with|do|actually|change|switch|record|log|save|add|allocate)\b/;
const NEGATED_RECORD_REQUEST = /\b(?:don't|do not|never)\s+(?:(?:want|need)\s+(?:you\s+to\s+)?)?(?:record|log|save|add|allocate)\b/;

/**
 * Resolves a period reference only against the active, validated planning
 * choice. The result describes the fact the user referred to; it never
 * approves, revises, or records a savings action.
 */
export function resolvePlanningReference(input: {
  readonly message: string;
  readonly choice: PendingPlanningChoice;
}): PlanningReferenceResolution {
  const { message, choice } = input;
  const normalized = message.trim().toLowerCase();
  if (!normalized || normalized.length > 180 || /\?/.test(normalized) ||
      /\b(?:not sure|maybe|either|both|compare|what about)\b/.test(normalized)) {
    return { kind: "not_a_reference" };
  }

  if (!isValidChoice(choice)) return { kind: "unresolved", reason: "invalid_context" };
  if (NEGATED_RECORD_REQUEST.test(normalized)) return { kind: "not_a_reference" };

  const hasTwelveMonthProjection = /\b(?:12|twelve)[\s-]+months?\b/.test(normalized) &&
    /\b(?:projection|projected|target|record|log|save|add)\b/.test(normalized);
  const hasMonthly = /\b(?:month|months|monthly)\b/.test(normalized) && !hasTwelveMonthProjection;
  const hasAnnual = /\b(?:annual|annually|yearly|year)\b/.test(normalized) || hasTwelveMonthProjection;
  if (!hasMonthly && !hasAnnual) return { kind: "not_a_reference" };
  if (hasMonthly && hasAnnual) {
    return PERIOD_SELECTION.test(normalized)
      ? { kind: "unresolved", reason: "conflicting_periods" }
      : { kind: "not_a_reference" };
  }

  const standaloneChoice = /^(?:(?:the|option|target|amount)\s+)?(?:monthly|month|annual|annually|yearly|year)(?:\s+(?:one|option|amount|target|projection))?[.! ]*$/.test(normalized);
  const isSelection = standaloneChoice || PERIOD_SELECTION.test(normalized);
  if (!isSelection) return { kind: "not_a_reference" };

  const period = hasAnnual ? "annual" : "monthly";
  const amountCents = period === "annual" ? choice.annualProjectionCents : choice.monthlyAmountCents;
  const explicitAmount = parseExplicitDollarAmount(message);
  if (explicitAmount.status === "valid" && explicitAmount.amountCents !== amountCents) {
    return { kind: "unresolved", reason: "amount_mismatch" };
  }
  if (explicitAmount.status !== "absent" && explicitAmount.status !== "valid") {
    return { kind: "unresolved", reason: "amount_mismatch" };
  }

  const recordingRequest = /\b(?:record|log|save|add)\b/.test(normalized);
  return {
    kind: "resolved",
    period,
    amountCents,
    amountMeaning: period === "annual" ? "conditional_projection" : "current_period_amount",
    operation: recordingRequest ? "request_recording" : "select_target"
  };
}

function isValidChoice(choice: PendingPlanningChoice): boolean {
  return Number.isSafeInteger(choice.monthlyAmountCents) && choice.monthlyAmountCents > 0 &&
    Number.isSafeInteger(choice.monthlyAmountCents * 12) &&
    Number.isSafeInteger(choice.annualProjectionCents) &&
    choice.annualProjectionCents === annualizeMonthlyAmountCents(choice.monthlyAmountCents);
}
