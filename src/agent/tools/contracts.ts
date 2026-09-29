import type {
  MoneyMovementMode,
  SavingsEntry,
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
  suggestionId: string;
  amountCents: number;
  reason: string;
  movementMode: MoneyMovementMode;
  approvedActionId?: string;
}

export interface VictoriaTools {
  findTypicalMerchantSpend(input: FindTypicalMerchantSpendInput): Promise<number | null>;
  estimateAvoidedSpend(input: EstimateAvoidedSpendInput): Promise<SavingsSuggestion | null>;
  createSavingsEntry(input: CreateSavingsEntryInput): Promise<SavingsEntry>;
}
