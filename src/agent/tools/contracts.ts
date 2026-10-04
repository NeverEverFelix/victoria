import type {
  MoneyMovementMode,
  SavingsEntry,
  SavingsGoalAllocation,
  SavingsSuggestion
} from "../../domain/savings/types.js";

export type { SavingsEntry } from "../../domain/savings/types.js";

export interface FindTypicalMerchantSpendInput {
  userId: string;
  merchantName: string;
}

export interface EstimateAvoidedSpendInput {
  userId: string;
  merchantName?: string;
  userProvidedAmountCents?: number;
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
}

export interface CreateSavingsGoalAllocationInput {
  userId: string;
  savingsEntryId: string;
  amountCents: number;
  goalName: string;
  approval: SavingsGoalAllocation["approval"];
  approvedActionId: string;
}

export interface VictoriaTools {
  findTypicalMerchantSpend(input: FindTypicalMerchantSpendInput): Promise<number | null>;
  estimateAvoidedSpend(input: EstimateAvoidedSpendInput): Promise<SavingsSuggestion | null>;
  /**
   * Must be idempotent for (userId, approvedActionId): return the committed entry on an
   * identical retry and reject reuse of that key for a different proposed entry.
   */
  createSavingsEntry(input: CreateSavingsEntryInput): Promise<SavingsEntry>;
  getWeeklySavingsTotal(userId: string, asOf?: Date): Promise<number>;
  createSavingsGoalAllocation(input: CreateSavingsGoalAllocationInput): Promise<SavingsGoalAllocation>;
}
