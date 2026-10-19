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
import { isUsableTransactionHistoryEstimate } from "../transaction-history-provider.js";

export class MockVictoriaTools implements VictoriaTools {
  private readonly savingsEntries: SavingsEntry[] = [];
  private readonly savingsGoalAllocations: SavingsGoalAllocation[] = [];
  private readonly savingsEntryCorrections: SavingsEntryCorrection[] = [];
  private readonly entriesByApprovedAction = new Map<string, SavingsEntry>();
  private readonly goalAllocationsByApprovedAction = new Map<string, SavingsGoalAllocation>();
  private readonly correctionsByApprovedAction = new Map<string, SavingsEntryCorrection>();
  private nextSavingsEntryNumber = 1;
  private nextSavingsCorrectionNumber = 1;

  constructor(
    private readonly habits: UserHabit[] = [],
    initialSavingsEntries: SavingsEntry[] = [],
    private readonly idFactory?: (namespace: string) => string
  ) {
    for (const entry of initialSavingsEntries) this.hydrateSavingsEntry(entry);
  }

  async findTypicalMerchantSpend(input: FindTypicalMerchantSpendInput): Promise<number | null> {
    const habit = this.habits.find(
      (candidate) => candidate.userId === input.userId &&
        candidate.merchantName.toLowerCase() === input.merchantName.toLowerCase()
    );

    return habit?.typicalAmountCents ?? null;
  }

  async estimateAvoidedSpend(input: EstimateAvoidedSpendInput): Promise<SavingsSuggestion | null> {
    if (input.userProvidedAmountCents !== undefined) {
      return {
        id: this.idFactory?.("suggestion") ?? `suggestion_${Date.now()}`,
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

    if (typicalAmountCents !== null) {
      return {
        id: this.idFactory?.("suggestion") ?? `suggestion_${Date.now()}`,
        amountCents: typicalAmountCents,
        currency: "USD",
        reason: `Estimated from typical spend at ${input.merchantName}.`,
        source: "merchant_history",
        movementMode: "mock_ledger"
      };
    }

    if (input.rememberedTypicalAmountCents !== undefined &&
        Number.isSafeInteger(input.rememberedTypicalAmountCents) && input.rememberedTypicalAmountCents > 0) {
      return {
        id: this.idFactory?.("suggestion") ?? `suggestion_${Date.now()}`,
        amountCents: input.rememberedTypicalAmountCents,
        currency: "USD",
        reason: `Estimated from your remembered typical spend at ${input.merchantName}.`,
        source: "manual_estimate",
        movementMode: "mock_ledger"
      };
    }

    const transactionEstimate = input.transactionHistoryEstimate;
    if (isUsableTransactionHistoryEstimate(transactionEstimate)) {
      return {
        id: this.idFactory?.("suggestion") ?? `suggestion_${Date.now()}`,
        amountCents: transactionEstimate.amountCents,
        currency: "USD",
        reason: `Estimate based on ${transactionEstimate.transactionCount} recent transactions at ${input.merchantName}, observed through ${transactionEstimate.observedThrough}.`,
        source: "transaction_history",
        movementMode: "mock_ledger"
      };
    }

    return null;
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
      id: this.idFactory?.("entry") ?? `entry_${this.nextSavingsEntryNumber++}`,
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

  /** Hydrates a durable mocked entry so the existing correction/allocation rules can inspect it. */
  hydrateSavingsEntry(entry: SavingsEntry): void {
    if (!entry.userId.trim() || !entry.id.trim() || !entry.eventId.trim() || !entry.proposalId.trim() ||
        !entry.approvalId.trim() || !entry.approvedActionId.trim() || !Number.isSafeInteger(entry.amountCents) ||
        entry.amountCents <= 0 || entry.currency !== "USD" || entry.movementMode !== "mock_ledger" ||
        entry.status !== "completed" || !entry.reason.trim() || !Number.isFinite(Date.parse(entry.createdAt))) {
      throw new Error("A durable savings entry must contain valid approved mocked-ledger data.");
    }
    const key = this.idempotencyKey(entry.userId, entry.approvedActionId);
    const existing = this.entriesByApprovedAction.get(key);
    if (existing) {
      if (existing.id !== entry.id || existing.amountCents !== entry.amountCents ||
          existing.approvalId !== entry.approvalId || existing.proposalId !== entry.proposalId) {
        throw new Error("An approved action cannot be hydrated with a different savings entry.");
      }
      return;
    }
    this.savingsEntries.push(immutableSnapshot(entry));
    this.entriesByApprovedAction.set(key, immutableSnapshot(entry));
    const entryNumber = /^entry_(\d+)$/.exec(entry.id);
    if (entryNumber) this.nextSavingsEntryNumber = Math.max(this.nextSavingsEntryNumber, Number(entryNumber[1]) + 1);
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
      id: `entry_correction_${this.nextSavingsCorrectionNumber++}`,
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

  /** Hydrates a durable correction so inherited totals apply its signed adjustment. */
  hydrateSavingsEntryCorrection(correction: SavingsEntryCorrection): void {
    const key = this.idempotencyKey(correction.userId, correction.approvedActionId);
    const existing = this.correctionsByApprovedAction.get(key);
    if (existing) {
      if (existing.id !== correction.id || existing.savingsEntryId !== correction.savingsEntryId ||
          existing.correctedAmountCents !== correction.correctedAmountCents ||
          existing.adjustmentCents !== correction.adjustmentCents || existing.approvalId !== correction.approvalId) {
        throw new Error("An approved action cannot be hydrated with a different savings correction.");
      }
      return;
    }
    if (!Number.isSafeInteger(correction.correctedAmountCents) || correction.correctedAmountCents <= 0 ||
        !Number.isSafeInteger(correction.adjustmentCents) || correction.adjustmentCents === 0 ||
        !correction.userId.trim() || !correction.id.trim() || !correction.savingsEntryId.trim() ||
        !correction.approvalId.trim() || !correction.approvedActionId.trim() || !correction.reason.trim() ||
        !Number.isFinite(Date.parse(correction.createdAt))) {
      throw new Error("A durable savings correction must contain valid positive cents and a non-zero adjustment.");
    }
    const entry = this.savingsEntries.find((candidate) => candidate.id === correction.savingsEntryId &&
      candidate.userId === correction.userId && candidate.status === "completed" && candidate.movementMode === "mock_ledger");
    if (!entry) throw new Error("A durable correction must reference a completed mocked entry owned by the user.");
    const currentAmount = entry.amountCents + this.savingsEntryCorrections
      .filter((item) => item.savingsEntryId === entry.id)
      .reduce((sum, item) => sum + item.adjustmentCents, 0);
    if (!Number.isSafeInteger(currentAmount + correction.adjustmentCents) ||
        currentAmount + correction.adjustmentCents !== correction.correctedAmountCents) {
      throw new Error("A durable correction must continue the linked entry's effective amount history.");
    }
    this.savingsEntryCorrections.push(immutableSnapshot(correction));
    this.correctionsByApprovedAction.set(key, immutableSnapshot(correction));
    const correctionNumber = /^entry_correction_(\d+)$/.exec(correction.id);
    if (correctionNumber) this.nextSavingsCorrectionNumber = Math.max(this.nextSavingsCorrectionNumber, Number(correctionNumber[1]) + 1);
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
    const effectiveAmount = await this.getEffectiveSavingsEntryAmount(input.userId, entry.id);
    if (input.amountCents !== effectiveAmount) {
      throw new Error("A goal allocation must match the linked savings entry's current effective amount.");
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
