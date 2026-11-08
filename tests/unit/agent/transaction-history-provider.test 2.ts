import { describe, expect, it } from "vitest";
import {
  isUsableTransactionHistoryEstimate,
  TRANSACTION_HISTORY_MAX_AGE_MS
} from "../../../src/agent/transaction-history-provider.js";

describe("transaction history evidence freshness", () => {
  const now = new Date("2026-10-13T12:00:00.000Z");
  const estimate = (observedThrough: string, overrides: Record<string, unknown> = {}) => ({
    amountCents: 740,
    transactionCount: 4,
    observedThrough,
    ...overrides
  });

  it("accepts valid history observed within the 90-day window, including its boundary", () => {
    const boundary = new Date(now.getTime() - TRANSACTION_HISTORY_MAX_AGE_MS).toISOString();

    expect(isUsableTransactionHistoryEstimate(estimate(boundary), now)).toBe(true);
    expect(isUsableTransactionHistoryEstimate(estimate("2026-10-12T00:00:00.000Z"), now)).toBe(true);
  });

  it("rejects stale, future, malformed, and insufficient transaction evidence", () => {
    const stale = new Date(now.getTime() - TRANSACTION_HISTORY_MAX_AGE_MS - 1).toISOString();

    expect(isUsableTransactionHistoryEstimate(estimate(stale), now)).toBe(false);
    expect(isUsableTransactionHistoryEstimate(estimate("2026-10-13T12:00:00.001Z"), now)).toBe(false);
    expect(isUsableTransactionHistoryEstimate(estimate("not-a-date"), now)).toBe(false);
    expect(isUsableTransactionHistoryEstimate(estimate("2026-10-12T00:00:00.000Z", { transactionCount: 2 }), now)).toBe(false);
    expect(isUsableTransactionHistoryEstimate(estimate("2026-10-12T00:00:00.000Z", { amountCents: 0 }), now)).toBe(false);
  });
});
