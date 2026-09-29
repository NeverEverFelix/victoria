export type CurrencyCode = "USD";

export interface Money {
  amountCents: number;
  currency: CurrencyCode;
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
