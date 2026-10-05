import type { FinancialEventType } from "../domain/financial-events/types.js";
import type { SavingsSuggestion } from "../domain/savings/types.js";
import type { ClassifiedMessage } from "./types.js";

const financialEventTypes = new Set<FinancialEventType>([
  "avoided_spend", "regretful_spend", "goal_allocation", "proposal_revision",
  "entry_correction", "pattern_reflection", "general_finance", "savings_progress",
  "real_money_movement_request", "unclear"
]);
const amountIssues = new Set(["invalid_value", "multiple_amounts", "invalid_precision", "unsupported_currency"]);
const suggestionSources = new Set(["merchant_history", "user_provided", "manual_estimate"]);

export function validateClassifiedMessage(candidate: unknown): ClassifiedMessage | null {
  if (!isRecord(candidate) || !financialEventTypes.has(candidate.type as FinancialEventType)) return null;
  if (typeof candidate.confidence !== "number" || !Number.isFinite(candidate.confidence) || candidate.confidence < 0 || candidate.confidence > 1) return null;
  if (typeof candidate.summary !== "string" || typeof candidate.needsClarification !== "boolean") return null;
  if (candidate.merchantName !== undefined && typeof candidate.merchantName !== "string") return null;
  if (candidate.goalName !== undefined && typeof candidate.goalName !== "string") return null;
  if (candidate.revisionReason !== undefined && typeof candidate.revisionReason !== "string") return null;
  const amountIssue = candidate.amountIssue;
  const amountCents = candidate.amountCents;
  if (amountIssue !== undefined && (typeof amountIssue !== "string" || !amountIssues.has(amountIssue))) return null;
  if (amountCents !== undefined &&
      (typeof amountCents !== "number" || !Number.isSafeInteger(amountCents) || amountCents <= 0 || amountIssue !== undefined)) return null;
  if (amountIssue !== undefined && (!candidate.needsClarification || amountCents !== undefined)) return null;

  return {
    type: candidate.type as FinancialEventType,
    confidence: candidate.confidence,
    ...(typeof candidate.merchantName === "string" ? { merchantName: candidate.merchantName } : {}),
    ...(typeof amountCents === "number" ? { amountCents } : {}),
    ...(typeof candidate.goalName === "string" ? { goalName: candidate.goalName } : {}),
    ...(typeof candidate.revisionReason === "string" ? { revisionReason: candidate.revisionReason } : {}),
    ...(typeof amountIssue === "string" ? { amountIssue: amountIssue as NonNullable<ClassifiedMessage["amountIssue"]> } : {}),
    summary: candidate.summary,
    needsClarification: candidate.needsClarification
  };
}

export function validateSavingsSuggestion(candidate: unknown): candidate is SavingsSuggestion {
  return isRecord(candidate) &&
    typeof candidate.id === "string" && candidate.id.length > 0 &&
    Number.isSafeInteger(candidate.amountCents) && (candidate.amountCents as number) > 0 &&
    candidate.currency === "USD" && typeof candidate.reason === "string" && candidate.reason.length > 0 &&
    suggestionSources.has(String(candidate.source)) && candidate.movementMode === "mock_ledger";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
