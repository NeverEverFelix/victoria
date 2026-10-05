export type CurrencyCode = "USD";

export interface Money {
  amountCents: number;
  currency: CurrencyCode;
}

export function formatUsd(amountCents: number): string {
  if (!Number.isSafeInteger(amountCents)) {
    throw new Error("USD formatting requires a safe integer number of cents.");
  }
  return new Intl.NumberFormat("en-US", {
    style: "currency",
    currency: "USD"
  }).format(amountCents / 100);
}

export function dollarsToCents(amountDollars: number): number {
  if (!Number.isFinite(amountDollars)) {
    throw new Error("Dollar amount must be a finite number.");
  }

  const amountCents = Math.round(amountDollars * 100);
  if (!Number.isSafeInteger(amountCents)) {
    throw new Error("Dollar amount must convert to a safe integer number of cents.");
  }
  return amountCents;
}
