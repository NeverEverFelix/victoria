import type {
  CreateSavingsEntryInput,
  EstimateAvoidedSpendInput,
  FindTypicalMerchantSpendInput,
  VictoriaTools
} from "./contracts.js";
import type { SavingsEntry } from "../../domain/savings/types.js";
import type { SavingsSuggestion, UserHabit } from "../types.js";

export class MockVictoriaTools implements VictoriaTools {
  constructor(private readonly habits: UserHabit[] = []) {}

  async findTypicalMerchantSpend(input: FindTypicalMerchantSpendInput): Promise<number | null> {
    const habit = this.habits.find(
      (candidate) =>
        candidate.merchantName.toLowerCase() === input.merchantName.toLowerCase()
    );

    return habit?.typicalAmountCents ?? null;
  }

  async estimateAvoidedSpend(input: EstimateAvoidedSpendInput): Promise<SavingsSuggestion | null> {
    if (input.userProvidedAmountCents !== undefined) {
      return {
        id: `suggestion_${Date.now()}`,
        amountCents: input.userProvidedAmountCents,
        currency: "USD",
        reason: "User provided an explicit avoided-spend amount.",
        source: "user_provided",
        movementMode: "mock_ledger"
      };
    }

    if (!input.merchantName) {
      return null;
    }

    const typicalAmountCents = await this.findTypicalMerchantSpend({
      userId: input.userId,
      merchantName: input.merchantName
    });

    if (typicalAmountCents === null) {
      return null;
    }

    return {
      id: `suggestion_${Date.now()}`,
      amountCents: typicalAmountCents,
      currency: "USD",
      reason: `Estimated from typical spend at ${input.merchantName}.`,
      source: "merchant_history",
      movementMode: "mock_ledger"
    };
  }

  async createSavingsEntry(input: CreateSavingsEntryInput): Promise<SavingsEntry> {
    return {
      id: `entry_${Date.now()}`,
      userId: input.userId,
      amountCents: input.amountCents,
      currency: "USD",
      reason: input.reason,
      movementMode: input.movementMode,
      status: "completed",
      createdAt: new Date().toISOString()
    };
  }
}
