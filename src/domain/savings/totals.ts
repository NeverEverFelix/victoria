import type { SavingsEntryLike } from "./types.js";

export function sumCompletedSavings(entries: SavingsEntryLike[]): number {
  return entries.reduce((totalCents, entry) => {
    if (entry.status !== "completed") {
      return totalCents;
    }

    return totalCents + entry.amountCents;
  }, 0);
}

export function calculatePotentialMonthlySavings(
  avoidedSpendAmountCents: number,
  timesPerMonth: number
): number {
  if (!Number.isInteger(timesPerMonth) || timesPerMonth < 0) {
    throw new Error("Times per month must be a non-negative integer.");
  }

  return avoidedSpendAmountCents * timesPerMonth;
}
