import type { MoneyMovementMode, SavingsSuggestion } from "../types.js";

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

export interface SavingsEntry {
  id: string;
  userId: string;
  amountCents: number;
  currency: "USD";
  reason: string;
  movementMode: MoneyMovementMode;
  status: "pending" | "completed" | "cancelled";
  createdAt: string;
}

export interface VictoriaTools {
  findTypicalMerchantSpend(input: FindTypicalMerchantSpendInput): Promise<number | null>;
  estimateAvoidedSpend(input: EstimateAvoidedSpendInput): Promise<SavingsSuggestion | null>;
  createSavingsEntry(input: CreateSavingsEntryInput): Promise<SavingsEntry>;
}

