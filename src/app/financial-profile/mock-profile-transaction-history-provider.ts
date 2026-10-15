import type { TransactionHistoryProvider, TypicalMerchantSpendFromTransactions } from "../../agent/transaction-history-provider.js";
import type { TransactionFinancialProfile } from "../../domain/financial-profile.js";

/**
 * Mock-only bridge from built financial profiles to estimate context.
 * This is useful for exercising the agent without Plaid or a persistent runtime.
 */
export class MockProfileTransactionHistoryProvider implements TransactionHistoryProvider {
  readonly lookupLog: Array<{ readonly userId: string; readonly merchantName: string }> = [];
  private readonly profilesByUser = new Map<string, TransactionFinancialProfile>();

  constructor(profiles: readonly TransactionFinancialProfile[] = []) {
    for (const profile of profiles) this.setProfile(profile);
  }

  setProfile(profile: TransactionFinancialProfile): void {
    if (!profile.userId.trim()) throw new Error("A profile user ID is required.");
    this.profilesByUser.set(profile.userId, profile);
  }

  async findTypicalMerchantSpend(input: {
    readonly userId: string;
    readonly merchantName: string;
  }): Promise<TypicalMerchantSpendFromTransactions | null> {
    this.lookupLog.push({ ...input });
    const profile = this.profilesByUser.get(input.userId);
    if (!profile) return null;
    const requestedKey = normalizeMerchant(input.merchantName);
    const fact = profile.facts.find((candidate) => candidate.dimension === "merchant" &&
      normalizeMerchant(candidate.key) === requestedKey);
    if (!fact || fact.transactionCount < 3 || fact.typicalAmountCents === null) return null;
    return Object.freeze({
      amountCents: fact.typicalAmountCents,
      transactionCount: fact.transactionCount,
      observedThrough: fact.observedThrough
    });
  }
}

function normalizeMerchant(value: string): string {
  return value.normalize("NFKD")
    .replace(/\p{M}+/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
