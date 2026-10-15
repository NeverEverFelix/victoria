import type { FinancialProfileTransaction } from "./financial-profile.js";

export type TransactionMetadataField = "detailedCategory" | "merchantEntityId" | "paymentChannel";

export interface TransactionMetadataFieldCoverage {
  readonly availableCount: number;
  readonly coverage: number;
}

export interface TransactionMetadataAvailability {
  readonly checkedTransactionCount: number;
  readonly fields: Readonly<Record<TransactionMetadataField, TransactionMetadataFieldCoverage>>;
  readonly hasEnrichableMetadata: boolean;
}

/** Reports whether optional, allow-listed Plaid metadata exists in the local sync read model. */
export function inspectTransactionMetadata(
  transactions: readonly Pick<FinancialProfileTransaction, TransactionMetadataField>[]
): TransactionMetadataAvailability {
  const fields: Record<TransactionMetadataField, TransactionMetadataFieldCoverage> = {
    detailedCategory: coverage(transactions, "detailedCategory"),
    merchantEntityId: coverage(transactions, "merchantEntityId"),
    paymentChannel: coverage(transactions, "paymentChannel")
  };
  return Object.freeze({
    checkedTransactionCount: transactions.length,
    fields: Object.freeze(fields),
    hasEnrichableMetadata: Object.values(fields).some((field) => field.availableCount > 0)
  });
}

function coverage(
  transactions: readonly Pick<FinancialProfileTransaction, TransactionMetadataField>[],
  key: TransactionMetadataField
): TransactionMetadataFieldCoverage {
  const availableCount = transactions.reduce((count, transaction) =>
    count + (typeof transaction[key] === "string" && transaction[key]!.trim() ? 1 : 0), 0);
  return Object.freeze({
    availableCount,
    coverage: transactions.length === 0 ? 0 : Number((availableCount / transactions.length).toFixed(4))
  });
}
