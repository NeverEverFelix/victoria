export interface TypicalMerchantSpendFromTransactions {
  readonly amountCents: number;
  readonly transactionCount: number;
  readonly observedThrough: string;
}

/** Transaction summaries older than this are too stale to support current estimates. */
export const TRANSACTION_HISTORY_MAX_AGE_MS = 90 * 24 * 60 * 60 * 1000;

export function isUsableTransactionHistoryEstimate(
  value: unknown,
  now: Date = new Date()
): value is TypicalMerchantSpendFromTransactions {
  if (!value || typeof value !== "object") return false;
  const estimate = value as {
    amountCents?: unknown;
    transactionCount?: unknown;
    observedThrough?: unknown;
  };
  if (!Number.isSafeInteger(estimate.amountCents) || (estimate.amountCents as number) <= 0 ||
      !Number.isSafeInteger(estimate.transactionCount) || (estimate.transactionCount as number) < 3 ||
      typeof estimate.observedThrough !== "string") return false;

  const observedAt = Date.parse(estimate.observedThrough);
  const nowMs = now.getTime();
  return Number.isFinite(observedAt) && Number.isFinite(nowMs) &&
    observedAt <= nowMs && nowMs - observedAt <= TRANSACTION_HISTORY_MAX_AGE_MS;
}

/**
 * Optional read-only seam for transaction evidence. A connected provider must use
 * the user's existing bank-link authorization and enforce user scope on every call;
 * it returns null when the connection is absent/revoked, history is stale, or data
 * is insufficient. The agent does not ask for per-lookup approval. No Plaid adapter
 * is wired in the MVP. The consumer also rejects summaries older than 90 days,
 * future-dated summaries, malformed values, and fewer than three transactions.
 */
export interface TransactionHistoryProvider {
  findTypicalMerchantSpend(input: {
    userId: string;
    merchantName: string;
  }): Promise<TypicalMerchantSpendFromTransactions | null>;
}
