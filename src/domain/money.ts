export type CurrencyCode = "USD";

export interface Money {
  amountCents: number;
  currency: CurrencyCode;
}

export interface SavingsEntryLike {
  amountCents: number;
  status: "pending" | "completed" | "cancelled";
}

export function formatUsd(amountCents: number): string {
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amountCents / 100);
}

export function dollarsToCents(amountDollars: number): number {
  if (!Number.isFinite(amountDollars)) {
    throw new Error("Dollar amount must be a finite number.");
  }

  return Math.round(amountDollars * 100);
}

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

