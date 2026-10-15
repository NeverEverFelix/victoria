import type {
  TransactionHistoryProvider,
  TypicalMerchantSpendFromTransactions
} from "../../src/agent/transaction-history-provider.js";

export interface MockTransactionHistoryRecord {
  readonly userId: string;
  readonly merchantName: string;
  readonly estimate: TypicalMerchantSpendFromTransactions;
}

/** Contract fixture for provider matching and user isolation; it is not a live adapter. */
export class MockTransactionHistoryProvider implements TransactionHistoryProvider {
  readonly lookupLog: Array<{ userId: string; merchantName: string }> = [];

  constructor(private readonly records: readonly MockTransactionHistoryRecord[]) {}

  async findTypicalMerchantSpend(input: {
    userId: string;
    merchantName: string;
  }): Promise<TypicalMerchantSpendFromTransactions | null> {
    this.lookupLog.push({ ...input });
    const requestedMerchant = normalizeMerchantName(input.merchantName);
    const record = this.records.find(candidate => candidate.userId === input.userId &&
      normalizeMerchantName(candidate.merchantName) === requestedMerchant);
    return record ? { ...record.estimate } : null;
  }
}

function normalizeMerchantName(value: string): string {
  return value.normalize("NFKD")
    .replace(/\p{Diacritic}/gu, "")
    .toLocaleLowerCase("en-US")
    .replace(/[^\p{Letter}\p{Number}]+/gu, " ")
    .trim()
    .replace(/\s+/g, " ");
}
