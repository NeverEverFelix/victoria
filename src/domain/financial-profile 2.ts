import { medianTypicalSpendCents } from "./financial-events/typical-spend.js";
import { inspectTransactionMetadata, type TransactionMetadataAvailability } from "./transaction-metadata.js";

export const FINANCIAL_PROFILE_LOOKBACK_DAYS = 90;

export interface FinancialProfileTransaction {
  readonly transactionId: string;
  /** Positive, posted purchase amount already converted to integer USD cents. */
  readonly amountCents: number;
  readonly isoCurrencyCode: string | null;
  readonly date: string;
  readonly merchantName: string | null;
  readonly category: string | null;
  readonly detailedCategory?: string | null;
  readonly merchantEntityId?: string | null;
  readonly paymentChannel?: string | null;
  readonly pending: boolean;
}

export interface FinancialProfileFact {
  readonly dimension: "merchant" | "category" | "channel";
  readonly key: string;
  readonly label: string;
  readonly transactionCount: number;
  readonly totalCents: number;
  readonly typicalAmountCents: number | null;
  readonly currency: "USD";
  readonly source: "plaid_transactions";
  readonly observedFrom: string;
  readonly observedThrough: string;
  readonly confidence: number;
}

export interface TransactionFinancialProfile {
  readonly userId: string;
  readonly source: "plaid_transactions";
  readonly generatedAt: string;
  readonly lookbackDays: number;
  readonly facts: readonly FinancialProfileFact[];
  readonly metadataAvailability: TransactionMetadataAvailability;
}

/**
 * Builds a compact profile from an already user-scoped transaction read.
 * Raw transaction identifiers and descriptions are deliberately not retained.
 */
export function buildTransactionFinancialProfile(input: {
  readonly userId: string;
  readonly now?: Date;
  readonly transactions: readonly FinancialProfileTransaction[];
}): TransactionFinancialProfile {
  if (typeof input.userId !== "string" || !input.userId.trim()) throw new Error("A user ID is required.");
  const now = input.now ?? new Date();
  if (!Number.isFinite(now.getTime())) throw new Error("A valid profile timestamp is required.");
  if (!Array.isArray(input.transactions)) throw new Error("Transactions must be an array.");

  const cutoff = now.getTime() - FINANCIAL_PROFILE_LOOKBACK_DAYS * 24 * 60 * 60 * 1000;
  const seen = new Set<string>();
  const merchantGroups = new Map<string, { label: string; amounts: number[]; dates: string[] }>();
  const categoryGroups = new Map<string, { label: string; amounts: number[]; dates: string[] }>();
  const channelGroups = new Map<string, { label: string; amounts: number[]; dates: string[] }>();

  for (const transaction of input.transactions) {
    if (!isQualifyingTransaction(transaction, cutoff, now.getTime()) || seen.has(transaction.transactionId)) continue;
    seen.add(transaction.transactionId);
    const date = transaction.date;
    const merchant = normalizeLabel(transaction.merchantName);
    const category = normalizeLabel(transaction.detailedCategory ?? transaction.category);
    const channel = normalizeLabel(transaction.paymentChannel ?? null);
    if (merchant) addToGroup(merchantGroups, merchant, transaction.amountCents, date);
    if (category) addToGroup(categoryGroups, category, transaction.amountCents, date);
    if (channel) addToGroup(channelGroups, channel, transaction.amountCents, date);
  }

  const facts = [
    ...toFacts("merchant", merchantGroups),
    ...toFacts("category", categoryGroups),
    ...toFacts("channel", channelGroups)
  ].sort((left, right) => right.transactionCount - left.transactionCount ||
    left.dimension.localeCompare(right.dimension) || left.key.localeCompare(right.key));

  return Object.freeze({
    userId: input.userId.trim(),
    source: "plaid_transactions",
    generatedAt: now.toISOString(),
    lookbackDays: FINANCIAL_PROFILE_LOOKBACK_DAYS,
    facts: Object.freeze(facts),
    metadataAvailability: inspectTransactionMetadata(input.transactions)
  });
}

function isQualifyingTransaction(
  value: FinancialProfileTransaction,
  cutoff: number,
  now: number
): boolean {
  if (!value || typeof value !== "object" || typeof value.transactionId !== "string" ||
      !value.transactionId.trim() || value.pending !== false || value.isoCurrencyCode !== "USD" ||
      !Number.isSafeInteger(value.amountCents) || value.amountCents <= 0 || typeof value.date !== "string") return false;
  const time = Date.parse(`${value.date}T00:00:00.000Z`);
  return Number.isFinite(time) && time >= cutoff && time <= now;
}

function normalizeLabel(value: string | null): { key: string; label: string } | null {
  if (typeof value !== "string" || !value.trim()) return null;
  const label = value.trim().replace(/\s+/g, " ");
  const key = label.normalize("NFKC").toLocaleLowerCase("en-US").replace(/[^\p{L}\p{N}]+/gu, " ").trim();
  return key ? { key, label } : null;
}

function addToGroup(
  groups: Map<string, { label: string; amounts: number[]; dates: string[] }>,
  normalized: { key: string; label: string },
  amountCents: number,
  date: string
): void {
  const group = groups.get(normalized.key) ?? { label: normalized.label, amounts: [], dates: [] };
  group.amounts.push(amountCents);
  group.dates.push(date);
  groups.set(normalized.key, group);
}

function toFacts(
  dimension: FinancialProfileFact["dimension"],
  groups: Map<string, { label: string; amounts: number[]; dates: string[] }>
): FinancialProfileFact[] {
  return [...groups.entries()].map(([key, group]) => {
    const totalCents = group.amounts.reduce((sum, amount) => {
      const total = sum + amount;
      if (!Number.isSafeInteger(total)) throw new Error("Financial profile total exceeds safe integer cents.");
      return total;
    }, 0);
    const count = group.amounts.length;
    return Object.freeze({
      dimension,
      key,
      label: group.label,
      transactionCount: count,
      totalCents,
      typicalAmountCents: medianTypicalSpendCents(group.amounts),
      currency: "USD" as const,
      source: "plaid_transactions" as const,
      observedFrom: group.dates.reduce((a, b) => a < b ? a : b),
      observedThrough: group.dates.reduce((a, b) => a > b ? a : b),
      confidence: count >= 3 ? 0.8 : count === 2 ? 0.6 : 0.4
    });
  });
}
