import type {
  CreateSavingsEntryInput,
  CreateSavingsEntryCorrectionInput,
  EstimateAvoidedSpendInput,
  FindTypicalMerchantSpendInput,
  CreateSavingsGoalAllocationInput,
  VictoriaTools
} from "./contracts.js";
import type { SavingsEntry, SavingsEntryCorrection, SavingsGoalAllocation } from "../../domain/savings/types.js";
import type { SavingsSuggestion, UserHabit } from "../types.js";
import { sumCompletedSavingsForWeek } from "../../domain/savings/totals.js";
import { immutableSnapshot } from "../../domain/immutable.js";

export class MockVictoriaTools implements VictoriaTools {
  private readonly savingsEntries: SavingsEntry[] = [];
  private readonly savingsGoalAllocations: SavingsGoalAllocation[] = [];
  private readonly savingsEntryCorrections: SavingsEntryCorrection[] = [];
  private readonly entriesByApprovedAction = new Map<string, SavingsEntry>();
  private readonly goalAllocationsByApprovedAction = new Map<string, SavingsGoalAllocation>();
  private readonly correctionsByApprovedAction = new Map<string, SavingsEntryCorrection>();
  private nextSavingsEntryNumber = 1;

  constructor(
    private readonly habits: UserHabit[] = [],
    initialSavingsEntries: SavingsEntry[] = []
  ) {
    this.savingsEntries.push(...initialSavingsEntries.map((entry) => immutableSnapshot(entry)));
    for (const entry of this.savingsEntries) {
      this.entriesByApprovedAction.set(this.idempotencyKey(entry.userId, entry.approvedActionId), entry);
    }
  }

  async findTypicalMerchantSpend(input: FindTypicalMerchantSpendInput): Promise<number | null> {
    const habit = this.habits.find(
      (candidate) => candidate.merchantName.toLowerCase() === input.merchantName.toLowerCase()
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
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
      throw new Error("Savings amount must be a positive safe integer number of cents.");
    }

    const idempotencyKey = this.idempotencyKey(input.userId, input.approvedActionId);
    const existingEntry = this.entriesByApprovedAction.get(idempotencyKey);
    if (existingEntry) {
      const sameAction = existingEntry.eventId === input.eventId &&
        existingEntry.proposalId === input.proposalId &&
        existingEntry.approvalId === input.approvalId &&
        existingEntry.amountCents === input.amountCents &&
        existingEntry.reason === input.reason &&
        existingEntry.goalName === input.goalName &&
        existingEntry.movementMode === input.movementMode;
      if (!sameAction) {
        throw new Error("An approved action cannot be reused for a different savings entry.");
      }
      return existingEntry;
    }

    const entry: SavingsEntry = immutableSnapshot({
      id: `entry_${this.nextSavingsEntryNumber++}`,
      userId: input.userId,
      eventId: input.eventId,
      proposalId: input.proposalId,
      approvalId: input.approvalId,
      approvedActionId: input.approvedActionId,
      amountCents: input.amountCents,
      currency: "USD",
      reason: input.reason,
      ...(input.goalName ? { goalName: input.goalName } : {}),
      movementMode: input.movementMode,
      status: "completed",
      createdAt: new Date().toISOString()
    });

    this.savingsEntries.push(entry);
    this.entriesByApprovedAction.set(idempotencyKey, entry);
    return entry;
  }

  async listSavingsEntries(userId: string): Promise<SavingsEntry[]> {
    return this.savingsEntries.filter((entry) => entry.userId === userId);
  }

  async createSavingsEntryCorrection(
    input: CreateSavingsEntryCorrectionInput
  ): Promise<SavingsEntryCorrection> {
    if (!Number.isSafeInteger(input.correctedAmountCents) || input.correctedAmountCents <= 0) {
      throw new Error("Corrected savings amount must be a positive safe integer number of cents.");
    }
    const key = this.idempotencyKey(input.userId, input.approvedActionId);
    const prior = this.correctionsByApprovedAction.get(key);
    if (prior) {
      if (prior.savingsEntryId !== input.savingsEntryId ||
          prior.correctedAmountCents !== input.correctedAmountCents || prior.reason !== input.reason ||
          prior.approvalId !== input.approvalId) {
        throw new Error("An approved action cannot be reused for a different savings correction.");
      }
      return prior;
    }
    const entry = this.savingsEntries.find((candidate) =>
      candidate.id === input.savingsEntryId && candidate.userId === input.userId &&
      candidate.status === "completed" && candidate.movementMode === "mock_ledger"
    );
    if (!entry) throw new Error("A correction must reference a completed mocked entry owned by the user.");
    const currentAmount = entry.amountCents + this.savingsEntryCorrections
      .filter((correction) => correction.savingsEntryId === entry.id)
      .reduce((sum, correction) => sum + correction.adjustmentCents, 0);
    const adjustmentCents = input.correctedAmountCents - currentAmount;
    if (!Number.isSafeInteger(adjustmentCents) || adjustmentCents === 0) {
      throw new Error("A correction must change the current amount by a non-zero safe integer number of cents.");
    }
    if (!Number.isSafeInteger(currentAmount + adjustmentCents) || currentAmount + adjustmentCents <= 0) {
      throw new Error("A corrected savings amount must remain positive and within the safe integer range.");
    }
    const correction: SavingsEntryCorrection = immutableSnapshot({
      id: `entry_correction_${this.savingsEntryCorrections.length + 1}`,
      userId: input.userId,
      savingsEntryId: entry.id,
      correctedAmountCents: input.correctedAmountCents,
      adjustmentCents,
      reason: input.reason,
      approvalId: input.approvalId,
      approvedActionId: input.approvedActionId,
      createdAt: new Date().toISOString()
    });
    this.savingsEntryCorrections.push(correction);
    this.correctionsByApprovedAction.set(key, correction);
    return correction;
  }

  async listSavingsEntryCorrections(userId: string): Promise<SavingsEntryCorrection[]> {
    return this.savingsEntryCorrections.filter((correction) => correction.userId === userId);
  }

  async getEffectiveSavingsEntryAmount(userId: string, savingsEntryId: string): Promise<number | null> {
    const entry = this.savingsEntries.find((candidate) =>
      candidate.id === savingsEntryId && candidate.userId === userId && candidate.status === "completed"
    );
    if (!entry) return null;
    return entry.amountCents + this.savingsEntryCorrections
      .filter((correction) => correction.savingsEntryId === entry.id)
      .reduce((sum, correction) => sum + correction.adjustmentCents, 0);
  }

  async getWeeklySavingsTotal(userId: string, asOf: Date = new Date()): Promise<number> {
    return sumCompletedSavingsForWeek(
      this.savingsEntries
        .filter((entry) => entry.userId === userId)
        .map((entry) => ({
          ...entry,
          amountCents: entry.amountCents + this.savingsEntryCorrections
            .filter((correction) => correction.savingsEntryId === entry.id)
            .reduce((sum, correction) => sum + correction.adjustmentCents, 0)
        })),
      asOf
    );
  }

  async createSavingsGoalAllocation(
    input: CreateSavingsGoalAllocationInput
  ): Promise<SavingsGoalAllocation> {
    const idempotencyKey = this.idempotencyKey(input.userId, input.approvedActionId);
    const existingAllocation = this.goalAllocationsByApprovedAction.get(idempotencyKey);
    if (existingAllocation) {
      const sameAction = existingAllocation.savingsEntryId === input.savingsEntryId &&
        existingAllocation.amountCents === input.amountCents &&
        existingAllocation.goalName === input.goalName &&
        existingAllocation.approval.id === input.approval.id &&
        existingAllocation.approval.actionId === input.approval.actionId &&
        existingAllocation.approval.approvedAt === input.approval.approvedAt;
      if (!sameAction) {
        throw new Error("An approved action cannot be reused for a different goal allocation.");
      }
      return existingAllocation;
    }

    const entry = this.savingsEntries.find(
      (candidate) => candidate.id === input.savingsEntryId && candidate.userId === input.userId
    );
    if (!entry || entry.status !== "completed") {
      throw new Error("A goal can only be linked to a completed savings entry owned by the user.");
    }
    if (entry.movementMode !== "mock_ledger") {
      throw new Error("A goal can only be linked to a mocked savings entry.");
    }
    if (input.amountCents !== entry.amountCents) {
      throw new Error("A goal allocation must match the linked savings entry amount.");
    }
    if (input.approval.actionId !== input.approvedActionId) {
      throw new Error("A goal allocation approval must match its approved action.");
    }
    if (this.savingsGoalAllocations.some((allocation) => allocation.savingsEntryId === entry.id)) {
      throw new Error("A savings entry can only have one goal allocation.");
    }

    const allocation: SavingsGoalAllocation = immutableSnapshot({
      id: `goal_allocation_${Date.now()}_${this.savingsGoalAllocations.length + 1}`,
      userId: input.userId,
      savingsEntryId: entry.id,
      amountCents: input.amountCents,
      goalName: input.goalName,
      status: "recorded",
      approval: input.approval,
      approvedActionId: input.approvedActionId,
      createdAt: input.approval.approvedAt
    });
    this.savingsGoalAllocations.push(allocation);
    this.goalAllocationsByApprovedAction.set(idempotencyKey, allocation);
    return allocation;
  }

  async listSavingsGoalAllocations(userId: string): Promise<SavingsGoalAllocation[]> {
    return this.savingsGoalAllocations.filter((allocation) => allocation.userId === userId);
  }

  private idempotencyKey(userId: string, approvedActionId: string): string {
    return JSON.stringify([userId, approvedActionId]);
  }
}
