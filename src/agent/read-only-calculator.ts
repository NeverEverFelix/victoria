import { parseExplicitDollarAmount } from "../domain/financial-events/parse-explicit-amount.js";

/** Read-only arithmetic result. This is evidence for wording only, never action authority. */
export interface VerifiedReadOnlyCalculation {
  readonly valueCents: number;
  readonly formula: string;
  readonly inputs: readonly { readonly label: string; readonly value: string }[];
  readonly assumptions: readonly string[];
}

/**
 * Resolve a deliberately small set of explicit recurring-savings questions.
 * The supported annualization is fixed at 52 weekly or 12 monthly periods.
 */
export function calculateReadOnlySavingsQuestion(message: string): VerifiedReadOnlyCalculation | undefined {
  if (!/[?？]/.test(message) ||
      /\b(?:record|log|add|transfer|deposit|withdraw|move|send|approve|confirm|balance|in my bank|in my account)\b/i.test(message)) return;
  if (!/\b(?:how much|what (?:is|would)|how many)\b/i.test(message) ||
      !/\b(?:over|in|for)\s+(?:a\s+)?(?:year|12\s+months?|52\s+weeks?)\b/i.test(message)) return;

  const amount = parseExplicitDollarAmount(message);
  if (amount.status !== "valid" || amount.amountCents <= 0) return;
  if (/\b(?:per|each|every)\s+week\b|\bweekly\b/i.test(message)) {
    const valueCents = amount.amountCents * 52;
    if (!Number.isSafeInteger(valueCents)) return;
    return Object.freeze({
      valueCents,
      formula: `${amount.amountCents} cents × 52 weeks`,
      inputs: Object.freeze([
        Object.freeze({ label: "weekly amount", value: String(amount.amountCents) }),
        Object.freeze({ label: "weeks", value: "52" })
      ]),
      assumptions: Object.freeze(["A year is treated as 52 weekly contributions."])
    });
  }
  if (/\b(?:per|each|every)\s+month\b|\bmonthly\b/i.test(message)) {
    const valueCents = amount.amountCents * 12;
    if (!Number.isSafeInteger(valueCents)) return;
    return Object.freeze({
      valueCents,
      formula: `${amount.amountCents} cents × 12 months`,
      inputs: Object.freeze([
        Object.freeze({ label: "monthly amount", value: String(amount.amountCents) }),
        Object.freeze({ label: "months", value: "12" })
      ]),
      assumptions: Object.freeze(["The monthly contribution is treated as unchanged for 12 months."])
    });
  }
  return;
}
