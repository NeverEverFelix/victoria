import type { AgentMemory, FinancialDecision, SavingsGoal, UserHabit } from "../types.js";
import type { TransactionFinancialProfile } from "../../domain/financial-profile.js";
import type { ConversationalMemory, MemoryProvider } from "./types.js";

export interface FinancialProfileMemoryWriter {
  rememberFinancialProfile(profile: TransactionFinancialProfile): Promise<readonly ConversationalMemory[]>;
}

export interface MemoryOrchestratorOptions {
  readonly financialProfiles?: FinancialProfileMemoryWriter;
  readonly maxMemoriesPerTurn?: number;
  readonly now?: () => Date;
}

export class MemoryNotFoundError extends Error {
  constructor() { super("The memory was not found for this user."); this.name = "MemoryNotFoundError"; }
}

export class InvalidMemoryCorrectionError extends Error {
  constructor() { super("A non-empty memory correction of at most 1000 characters is required."); this.name = "InvalidMemoryCorrectionError"; }
}

export class ManagedProfileMemoryError extends Error {
  constructor() { super("Transaction-profile memories are managed by the connected financial profile. Disconnect or delete that profile to remove them."); this.name = "ManagedProfileMemoryError"; }
}

/**
 * Coordinates durable semantic memories, SQLite short-term context, and derived financial profiles.
 * It owns memory lifecycle policy while storage adapters own persistence and vector search.
 */
export class MemoryOrchestrator implements MemoryProvider {
  private readonly maxMemoriesPerTurn: number;

  constructor(
    private readonly storage: MemoryProvider,
    private readonly options: MemoryOrchestratorOptions = {}
  ) {
    this.maxMemoriesPerTurn = Math.max(1, Math.min(options.maxMemoriesPerTurn ?? 12, 30));
  }

  async getMemoryForUser(userId: string, query?: string): Promise<AgentMemory> {
    const memory = await this.storage.getMemoryForUser(userId, query);
    const paused = await this.isMemoryPaused(userId);
    const candidates = (memory.conversationalMemories ?? []).filter((item) =>
      !paused || item.sourceType === "plaid_transaction_profile");
    const current = await this.currentMemoryIds(userId);
    return Object.freeze({
      ...memory,
      conversationalMemories: Object.freeze(this.selectCurrent(candidates, current))
    });
  }

  createSavingsGoal(userId: string, goal: Omit<SavingsGoal, "userId" | "savedAmountCents">, approvedActionId: string): Promise<SavingsGoal> {
    return this.storage.createSavingsGoal(userId, goal, approvedActionId);
  }

  async rememberConversationalMemory(
    userId: string,
    memory: Omit<ConversationalMemory, "id" | "createdAt">
  ): Promise<ConversationalMemory> {
    if (!userId.trim()) throw new Error("A user ID is required to remember a fact.");
    const all = await this.storage.listConversationalMemories(userId);
    const active = this.selectVisibleCurrent(all);
    const prior = [...active].reverse().find((item) => item.category === memory.category && item.key === memory.key);
    if (prior && prior.value === memory.value && prior.evidence === memory.evidence &&
        (prior.sourceType ?? "user_statement") === (memory.sourceType ?? "user_statement") &&
        prior.confidence >= memory.confidence) return prior;
    return this.storage.rememberConversationalMemory(userId, {
      ...memory,
      ...((memory.supersedesId || !prior) ? {} : { supersedesId: prior.id })
    });
  }

  async correctMemory(userId: string, memoryId: string, correctedValue: string, evidence?: string): Promise<ConversationalMemory> {
    const value = typeof correctedValue === "string" ? correctedValue.trim() : "";
    if (!value || value.length > 1000) throw new InvalidMemoryCorrectionError();
    const target = (await this.listCurrentStoredMemories(userId)).find((memory) => memory.id === memoryId);
    if (!target) throw new MemoryNotFoundError();
    if (target.sourceType === "plaid_transaction_profile") throw new ManagedProfileMemoryError();
    const corrected = await this.rememberConversationalMemory(userId, {
      category: target.category,
      key: target.key,
      value,
      evidence: evidence?.trim() || `The user corrected this memory: ${value}`,
      confidence: 1,
      sourceType: "user_correction",
      sourceMetadata: { correctedFrom: target.sourceType ?? "user_statement" },
      supersedesId: target.id
    });
    await this.invalidateCachedMemory(userId);
    return corrected;
  }

  async forgetMemory(userId: string, memoryId: string): Promise<void> {
    if (!userId.trim() || !memoryId.trim()) throw new MemoryNotFoundError();
    const target = (await this.listCurrentStoredMemories(userId)).find((memory) => memory.id === memoryId);
    if (!target) throw new MemoryNotFoundError();
    if (target.sourceType === "plaid_transaction_profile") throw new ManagedProfileMemoryError();
    const removed = await this.forgetConversationalMemory(userId, memoryId);
    if (!removed) throw new MemoryNotFoundError();
  }

  async forgetConversationalMemory(userId: string, memoryId: string): Promise<boolean> {
    const target = (await this.listCurrentStoredMemories(userId)).find((memory) => memory.id === memoryId);
    if (!target) return false;
    if (target.sourceType === "plaid_transaction_profile") throw new ManagedProfileMemoryError();
    const removed = await this.storage.forgetConversationalMemory(userId, memoryId);
    if (removed) await this.invalidateCachedMemory(userId);
    return removed;
  }

  async forgetAllConversationalMemories(userId: string): Promise<number> {
    if (!userId.trim()) return 0;
    const removed = await this.storage.forgetAllConversationalMemories(userId);
    await this.invalidateCachedMemory(userId);
    return removed;
  }

  isMemoryPaused(userId: string): Promise<boolean> { return this.storage.isMemoryPaused(userId); }
  setMemoryPaused(userId: string, paused: boolean): Promise<void> { return this.storage.setMemoryPaused(userId, paused); }

  async rememberTransactionCorrection(input: {
    readonly userId: string;
    readonly memoryId: string;
    readonly amountCents: number;
    readonly evidence: string;
    readonly referenceText: string;
  }): Promise<ConversationalMemory> {
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
      throw new InvalidMemoryCorrectionError();
    }
    const target = (await this.listCurrentStoredMemories(input.userId)).find((memory) => memory.id === input.memoryId);
    if (!target || (target.category !== "financial_pattern" && target.category !== "habit")) throw new MemoryNotFoundError();
    const actualSpend = `User reports spending $${(input.amountCents / 100).toFixed(2)} on ${input.referenceText}.`;
    const targetIsAggregate = target.sourceType === "plaid_transaction_profile" ||
      target.key.startsWith("financial_profile:") ||
      (target.category === "habit" && target.key.startsWith("merchant_spend:"));
    if (targetIsAggregate) {
      const referenceKey = input.referenceText.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "").slice(0, 48);
      const correction = await this.rememberConversationalMemory(input.userId, {
        category: "financial_pattern",
        key: `transaction_correction:${target.key}:${referenceKey || "referenced_day"}`,
        value: actualSpend,
        evidence: input.evidence,
        confidence: 1,
        sourceType: "user_correction",
        sourceMetadata: { correctionOfMemoryId: target.id, correctionScope: "individual_transaction" }
      });
      await this.invalidateCachedMemory(input.userId);
      return correction;
    }
    const corrected = await this.correctMemory(input.userId, target.id, actualSpend, input.evidence);
    await this.invalidateCachedMemory(input.userId);
    return corrected;
  }

  async rememberFinancialProfile(profile: TransactionFinancialProfile): Promise<readonly ConversationalMemory[]> {
    if (!this.options.financialProfiles) throw new Error("A financial profile memory writer is not configured.");
    const saved = await this.options.financialProfiles.rememberFinancialProfile(profile);
    await this.invalidateCachedMemory(profile.userId);
    return saved;
  }

  async listConversationalMemories(userId: string): Promise<readonly ConversationalMemory[]> {
    return Object.freeze(await this.listCurrentStoredMemories(userId));
  }

  async searchConversationalMemories(userId: string, query: string, limit = this.maxMemoriesPerTurn): Promise<readonly ConversationalMemory[]> {
    if (!userId.trim() || !query.trim()) return [];
    const memoryPaused = await this.isMemoryPaused(userId);
    const [candidates, current] = await Promise.all([
      this.storage.searchConversationalMemories(userId, query, Math.max(limit, this.maxMemoriesPerTurn)),
      this.currentMemoryIds(userId)
    ]);
    const results = this.selectCurrent(candidates, current, limit);
    return Object.freeze(memoryPaused
      ? results.filter((item) => item.sourceType === "plaid_transaction_profile")
      : results);
  }

  rememberDecision(userId: string, decision: Omit<FinancialDecision, "id" | "createdAt">): Promise<FinancialDecision> {
    return this.storage.rememberDecision(userId, decision);
  }
  listHabits(userId: string): Promise<UserHabit[]> { return this.storage.listHabits(userId); }
  listGoals(userId: string): Promise<SavingsGoal[]> { return this.storage.listGoals(userId); }
  getConversationContext(userId: string, conversationId: string): Promise<readonly string[]> {
    return this.storage.getConversationContext(userId, conversationId);
  }
  setConversationContext(userId: string, conversationId: string, messages: readonly string[]): Promise<void> {
    return this.storage.setConversationContext(userId, conversationId, messages);
  }

  private async listCurrentStoredMemories(userId: string): Promise<ConversationalMemory[]> {
    const memories = await this.storage.listConversationalMemories(userId);
    return this.selectVisibleCurrent(memories);
  }

  private selectVisibleCurrent(memories: readonly ConversationalMemory[]): ConversationalMemory[] {
    const superseded = new Set(memories.flatMap((memory) => memory.supersedesId ? [memory.supersedesId] : []));
    const current = memories.filter((memory) => !superseded.has(memory.id) && this.isFresh(memory));
    const selected = new Map<string, ConversationalMemory>();
    for (const memory of current) {
      const identity = `${memory.category}\u0000${memory.key}`;
      const previous = selected.get(identity);
      if (!previous || memoryAuthority(memory) > memoryAuthority(previous) ||
          (memoryAuthority(memory) === memoryAuthority(previous) && memory.createdAt > previous.createdAt)) {
        selected.set(identity, memory);
      }
    }
    return [...selected.values()];
  }

  private async currentMemoryIds(userId: string): Promise<ReadonlySet<string>> {
    return new Set((await this.listCurrentStoredMemories(userId)).map((memory) => memory.id));
  }

  private selectCurrent(
    candidates: readonly ConversationalMemory[],
    currentIds: ReadonlySet<string>,
    requestedLimit = this.maxMemoriesPerTurn
  ): ConversationalMemory[] {
    const now = this.options.now?.() ?? new Date();
    const limit = Math.max(1, Math.min(requestedLimit, this.maxMemoriesPerTurn));
    const selected: ConversationalMemory[] = [];
    const byKey = new Map<string, number>();
    for (const memory of candidates) {
      if (!currentIds.has(memory.id) || !this.isFresh(memory, now)) continue;
      const identity = `${memory.category}\u0000${memory.key}`;
      const existingIndex = byKey.get(identity);
      if (existingIndex !== undefined) {
        const existing = selected[existingIndex];
        if (existing && memoryAuthority(memory) > memoryAuthority(existing)) selected[existingIndex] = memory;
        continue;
      }
      byKey.set(identity, selected.length);
      selected.push(memory);
    }
    return selected.slice(0, limit);
  }

  private isFresh(memory: ConversationalMemory, now = this.options.now?.() ?? new Date()): boolean {
    if (memory.sourceType !== "plaid_transaction_profile") return true;
    if (!memory.observedThrough) return false;
    const observedThrough = Date.parse(`${memory.observedThrough.slice(0, 10)}T00:00:00.000Z`);
    const cutoff = now.getTime() - 90 * 86_400_000;
    return Number.isFinite(observedThrough) && observedThrough >= cutoff && observedThrough <= now.getTime();
  }

  private async invalidateCachedMemory(userId: string): Promise<void> {
    const cache = this.storage as MemoryProvider & { invalidateUserMemoryCache?: (userId: string) => void };
    cache.invalidateUserMemoryCache?.(userId);
  }
}

function memoryAuthority(memory: ConversationalMemory): number {
  switch (memory.sourceType) {
    case "user_correction": return 4;
    case "user_statement": return 3;
    case "plaid_transaction_profile": return 2;
    case "system_inference": return 1;
    default: return 3;
  }
}
