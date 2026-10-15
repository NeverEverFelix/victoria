import { describe, expect, it } from "vitest";
import { buildTransactionFinancialProfile } from "../../../src/domain/financial-profile.js";

const now = new Date("2026-10-13T12:00:00.000Z");

describe("buildTransactionFinancialProfile", () => {
  it("derives bounded merchant and category facts from posted USD transactions", () => {
    const profile = buildTransactionFinancialProfile({
      userId: "user-a",
      now,
      transactions: [
        transaction("t1", 1200, "2026-09-01", "Blue Bottle", "Food and Drink"),
        transaction("t2", 600, "2026-09-15", "Blue Bottle", "Food and Drink"),
        transaction("t3", 7400, "2026-10-01", "Blue Bottle", "Food and Drink"),
        transaction("t4", 3000, "2026-10-05", "Market", "Groceries"),
        transaction("pending", 9999, "2026-10-06", "Blue Bottle", "Food and Drink", true),
        transaction("income", -500000, "2026-10-07", "Payroll", "Income")
      ]
    });

    expect(profile.userId).toBe("user-a");
    expect(profile.source).toBe("plaid_transactions");
    expect(profile.metadataAvailability.hasEnrichableMetadata).toBe(false);
    expect(profile.metadataAvailability.checkedTransactionCount).toBe(6);
    expect(profile.facts).toHaveLength(4);
    expect(profile.facts).toContainEqual(expect.objectContaining({
      dimension: "merchant", key: "blue bottle", label: "Blue Bottle", transactionCount: 3,
      totalCents: 9200, typicalAmountCents: 1200, currency: "USD", confidence: 0.8
    }));
    expect(profile.facts).toContainEqual(expect.objectContaining({
      dimension: "category", key: "food and drink", label: "Food and Drink", transactionCount: 3,
      totalCents: 9200, currency: "USD", confidence: 0.8
    }));
    expect(profile.facts).toContainEqual(expect.objectContaining({
      dimension: "category", key: "groceries", transactionCount: 1, totalCents: 3000,
      typicalAmountCents: null, confidence: 0.4
    }));
    expect(JSON.stringify(profile)).not.toContain("t1");
    expect(profile.facts[0]?.observedFrom).toBe("2026-09-01");
    expect(profile.facts[0]?.observedThrough).toBe("2026-10-01");
  });

  it("excludes stale, malformed, non-USD, pending, and invalid transactions", () => {
    const profile = buildTransactionFinancialProfile({
      userId: "user-a",
      now,
      transactions: [
        transaction("old", 2000, "2026-01-01", "Cafe", "Food"),
        transaction("future", 2000, "2026-10-14", "Cafe", "Food"),
        { ...transaction("eur", 2000, "2026-10-01", "Cafe", "Food"), isoCurrencyCode: "EUR" },
        transaction("pending", 2000, "2026-10-02", "Cafe", "Food", true),
        { ...transaction("bad", 2000, "2026-10-03", "Cafe", "Food"), amountCents: Number.MAX_SAFE_INTEGER + 1 }
      ]
    });
    expect(profile.facts).toEqual([]);
  });

  it("uses detailed categories and payment channel when metadata is available", () => {
    const profile = buildTransactionFinancialProfile({ userId: "user-a", now, transactions: [
      { ...transaction("metadata", 2500, "2026-10-01", "Cafe", "FOOD_AND_DRINK"),
        detailedCategory: "FOOD_AND_DRINK_COFFEE", merchantEntityId: "merchant-cafe", paymentChannel: "online" }
    ] });

    expect(profile.metadataAvailability).toEqual({
      checkedTransactionCount: 1,
      fields: {
        detailedCategory: { availableCount: 1, coverage: 1 },
        merchantEntityId: { availableCount: 1, coverage: 1 },
        paymentChannel: { availableCount: 1, coverage: 1 }
      },
      hasEnrichableMetadata: true
    });
    expect(profile.facts).toContainEqual(expect.objectContaining({ dimension: "category", key: "food and drink coffee" }));
    expect(profile.facts).toContainEqual(expect.objectContaining({ dimension: "channel", key: "online", transactionCount: 1 }));
  });

  it("does not return a profile for an invalid user identity", () => {
    expect(() => buildTransactionFinancialProfile({ userId: " ", now, transactions: [] })).toThrow();
  });
});

function transaction(
  transactionId: string,
  amountCents: number,
  date: string,
  merchantName: string,
  category: string,
  pending = false
) {
  return { transactionId, amountCents, isoCurrencyCode: "USD", date, merchantName, category, pending };
}
