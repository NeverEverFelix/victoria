import type {
  MoneyMovementMode,
  SavingsEntry,
  SavingsEntryCorrection,
  SavingsGoalAllocation,
  SavingsSuggestion
} from "../../domain/savings/types.js";
import type { TurnActionReceipt } from "../types.js";

export type { SavingsEntry } from "../../domain/savings/types.js";

export interface FindTypicalMerchantSpendInput {
  userId: string;
  merchantName: string;
}

export interface EstimateAvoidedSpendInput {
  userId: string;
  merchantName?: string;
  userProvidedAmountCents?: number;
  rememberedTypicalAmountCents?: number;
  transactionHistoryEstimate?: {
    amountCents: number;
    transactionCount: number;
    observedThrough: string;
  };
}

export interface CreateSavingsEntryInput {
  userId: string;
  eventId: string;
  proposalId: string;
  approvalId: string;
  suggestionId: string;
  amountCents: number;
  reason: string;
  goalName?: string;
  movementMode: MoneyMovementMode;
  approvedActionId: string;
  /** Persisted atomically with the ledger row for crash-safe turn completion. */
  turnActionReceipt?: TurnActionReceipt;
}

export interface CreateSavingsGoalAllocationInput {
  userId: string;
  savingsEntryId: string;
  amountCents: number;
  goalName: string;
  approval: SavingsGoalAllocation["approval"];
  approvedActionId: string;
  /** Persisted atomically with the allocation row for crash-safe turn completion. */
  turnActionReceipt?: TurnActionReceipt;
}

export interface CreateSavingsEntryCorrectionInput {
  userId: string;
  savingsEntryId: string;
  correctedAmountCents: number;
  reason: string;
  approvalId: string;
  approvedActionId: string;
  /** Persisted atomically with the correction row for crash-safe turn completion. */
  turnActionReceipt?: TurnActionReceipt;
}

export interface VictoriaTools {
  findTypicalMerchantSpend(input: FindTypicalMerchantSpendInput): Promise<number | null>;
  estimateAvoidedSpend(input: EstimateAvoidedSpendInput): Promise<SavingsSuggestion | null>;
  /**
   * Must be idempotent for (userId, approvedActionId): return the committed entry on an
   * identical retry and reject reuse of that key for a different proposed entry.
   */
  createSavingsEntry(input: CreateSavingsEntryInput): Promise<SavingsEntry>;
  /** Must be idempotent for (userId, approvedActionId), returning the committed correction on an identical retry. */
  createSavingsEntryCorrection(input: CreateSavingsEntryCorrectionInput): Promise<SavingsEntryCorrection>;
  getEffectiveSavingsEntryAmount(userId: string, savingsEntryId: string): Promise<number | null>;
  getWeeklySavingsTotal(userId: string, asOf?: Date): Promise<number>;
  /** Must be idempotent for (userId, approvedActionId), returning the existing allocation on an identical retry. */
  createSavingsGoalAllocation(input: CreateSavingsGoalAllocationInput): Promise<SavingsGoalAllocation>;
}
