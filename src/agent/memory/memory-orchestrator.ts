import type { AgentMemory, FinancialDecision, SavingsGoal, UserHabit } from "../types.js";
import type { TransactionFinancialProfile } from "../../domain/financial-profile.js";
import type { ConversationMessage, ConversationalMemory, ConversationalMemoryPage, MemoryProvider } from "./types.js";
import { extractConversationalMemory } from "./extract-preference.js";
import { conversationMessagesFromLegacy, legacyConversationContext } from "./conversation-transcript.js";

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
    const candidates = memory.conversationalMemories ?? [];
    const current = await this.currentMemoryIds(userId, candidates.map((memory) => memory.id));
    return Object.freeze({
      ...memory,
      conversationalMemories: Object.freeze(this.selectCurrent(candidates, current))
    });
  }

  async rememberConversationalMemory(
    userId: string,
    memory: Omit<ConversationalMemory, "id" | "createdAt">
  ): Promise<ConversationalMemory> {
    if (!userId.trim()) throw new Error("A user ID is required to remember a fact.");
    const all = await this.listCurrentMemoryRecords(userId);
    const active = this.selectCurrentRecords(all);
    const incomingTurnIds = memoryTurnIds(memory);
    const prior = [...active].reverse().find((item) => item.category === memory.category && item.key === memory.key);
    const sameTurnPrior = memory.sourceType !== "user_correction" && memory.sourceMetadata?.memoryStatus !== "forgotten" &&
      incomingTurnIds.size > 0 && [...active].reverse().find((item) =>
      item.category === memory.category && item.key === memory.key &&
      [...memoryTurnIds(item)].some((turnId) => incomingTurnIds.has(turnId)));
    if (sameTurnPrior) return sameTurnPrior;
    if (prior && prior.value === memory.value && prior.evidence === memory.evidence &&
        (prior.sourceType ?? "user_statement") === (memory.sourceType ?? "user_statement") &&
        prior.confidence >= memory.confidence) return prior;
    return this.storage.rememberConversationalMemory(userId, {
      ...memory,
      sourceType: memory.sourceType ?? "user_statement",
      ...((prior || memory.sourceMetadata?.sourceTurnReferences) ? {
        sourceMetadata: mergeSourceTurnEvidence(prior, memory.sourceMetadata)
      } : {}),
      ...((memory.supersedesId || !prior) ? {} : { supersedesId: prior.id })
    });
  }

  async correctMemory(userId: string, memoryId: string, correctedValue: string, evidence?: string): Promise<ConversationalMemory> {
    const value = typeof correctedValue === "string" ? correctedValue.trim() : "";
    if (!value || value.length > 1000) throw new InvalidMemoryCorrectionError();
    const target = (await this.listCurrentStoredMemories(userId)).find((memory) => memory.id === memoryId);
    if (!target) throw new MemoryNotFoundError();
    if (target.key.startsWith("financial_profile:")) throw new InvalidMemoryCorrectionError();
    if (target.key.startsWith("interest:") || target.key.startsWith("interest_spend:") ||
        target.key.startsWith("activity_mapping:")) {
      const extracted = extractConversationalMemory(value);
      const validStructuredCorrection = target.key.startsWith("interest:")
        ? extracted?.category === "other" && extracted.key.startsWith("interest:")
        : target.key.startsWith("interest_spend:")
          ? extracted?.key.startsWith("interest_spend:")
          : extracted?.key.startsWith("activity_mapping:");
      if (!extracted || !validStructuredCorrection) throw new InvalidMemoryCorrectionError();
      const correctedStructured = await this.rememberConversationalMemory(userId, {
        ...extracted,
        evidence: evidence?.trim() || `The user corrected this memory: ${value}`,
        confidence: 1,
        sourceType: "user_correction",
        sourceMetadata: { ...extracted.sourceMetadata, ...sourceTurnEvidenceMetadata(target), correctedFrom: target.id },
        supersedesId: target.id
      });
      await this.invalidateCachedMemory(userId);
      return correctedStructured;
    }
    const corrected = await this.rememberConversationalMemory(userId, {
      category: target.category,
      key: target.key,
      value,
      evidence: evidence?.trim() || `The user corrected this memory: ${value}`,
      confidence: 1,
      sourceType: "user_correction",
      sourceMetadata: { ...sourceTurnEvidenceMetadata(target), correctedFrom: target.sourceType ?? "user_statement" },
      supersedesId: target.id
    });
    await this.invalidateCachedMemory(userId);
    return corrected;
  }

  /** Suppresses one current memory from future retrieval while preserving append-only history. */
  async forgetMemory(userId: string, memoryId: string): Promise<void> {
    const target = (await this.listCurrentStoredMemories(userId)).find((memory) => memory.id === memoryId);
    if (!target) throw new MemoryNotFoundError();
    await this.rememberConversationalMemory(userId, {
      category: target.category,
      key: target.key,
      value: "This memory was forgotten at the user's request.",
      evidence: "The user asked Victoria to forget this memory.",
      confidence: 1,
      sourceType: "user_correction",
      sourceMetadata: { ...sourceTurnEvidenceMetadata(target), memoryStatus: "forgotten" },
      supersedesId: target.id
    });
    await this.invalidateCachedMemory(userId);
  }

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
        sourceMetadata: { ...sourceTurnEvidenceMetadata(target), correctionOfMemoryId: target.id, correctionScope: "individual_transaction" }
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

  async listConversationalMemories(userId: string, page?: ConversationalMemoryPage): Promise<readonly ConversationalMemory[]> {
    if (this.storage.listCurrentConversationalMemories) {
      // This adapter already applies lifecycle filtering before keyset pagination.
      // Re-filtering its page can drop valid results at page boundaries.
      return Object.freeze([...(await this.storage.listCurrentConversationalMemories(userId, false, page))]);
    }
    const candidates = await this.storage.listConversationalMemories(userId);
    return Object.freeze(this.selectVisibleCurrent(candidates));
  }

  /** Internal retrieval view that includes current correction/forget markers for episode suppression. */
  async listCurrentConversationalMemories(
    userId: string,
    includeForgottenMarkers = false,
    page?: ConversationalMemoryPage
  ): Promise<readonly ConversationalMemory[]> {
    if (this.storage.listCurrentConversationalMemories) {
      return Object.freeze([...(await this.storage.listCurrentConversationalMemories(userId, includeForgottenMarkers, page))]);
    }
    const records = await this.storage.listConversationalMemories(userId, page);
    return Object.freeze(includeForgottenMarkers ? this.selectCurrentRecords(records) : this.selectVisibleCurrent(records));
  }

  async searchConversationalMemories(userId: string, query: string, limit = this.maxMemoriesPerTurn): Promise<readonly ConversationalMemory[]> {
    if (!userId.trim() || !query.trim()) return [];
    const candidates = await this.storage.searchConversationalMemories(userId, query, Math.max(limit, this.maxMemoriesPerTurn));
    const current = await this.currentMemoryIds(userId, candidates.map((memory) => memory.id));
    return Object.freeze(this.selectCurrent(candidates, current, limit));
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
  async getConversationMessages(userId: string, conversationId: string): Promise<readonly ConversationMessage[]> {
    if (this.storage.getConversationMessages) return this.storage.getConversationMessages(userId, conversationId);
    return conversationMessagesFromLegacy(conversationId, await this.storage.getConversationContext(userId, conversationId));
  }
  async setConversationMessages(userId: string, conversationId: string, messages: readonly ConversationMessage[]): Promise<void> {
    if (this.storage.setConversationMessages) {
      await this.storage.setConversationMessages(userId, conversationId, messages);
      return;
    }
    await this.storage.setConversationContext(userId, conversationId, legacyConversationContext(messages));
  }

  private async listCurrentStoredMemories(userId: string): Promise<ConversationalMemory[]> {
    const current = await this.listCurrentMemoryRecords(userId);
    return this.selectVisibleCurrent(current);
  }

  private async listCurrentMemoryRecords(userId: string): Promise<ConversationalMemory[]> {
    if (this.storage.listCurrentConversationalMemories) {
      return [...await this.storage.listCurrentConversationalMemories(userId, true)];
    }
    const memories = await this.storage.listConversationalMemories(userId);
    return this.selectCurrentRecords(memories);
  }

  private selectVisibleCurrent(memories: readonly ConversationalMemory[]): ConversationalMemory[] {
    const superseded = new Set(memories.flatMap((memory) => memory.supersedesId ? [memory.supersedesId] : []));
    const forgottenKeys = new Set(memories.filter((memory) => !superseded.has(memory.id) &&
      memory.sourceMetadata?.memoryStatus === "forgotten").map((memory) => `${memory.category}\u0000${memory.key}`));
    return this.selectCurrentRecords(memories).filter((memory) =>
      memory.sourceMetadata?.memoryStatus !== "forgotten" && !forgottenKeys.has(`${memory.category}\u0000${memory.key}`));
  }

  private selectCurrentRecords(memories: readonly ConversationalMemory[]): ConversationalMemory[] {
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

  private async currentMemoryIds(userId: string, candidateIds: readonly string[]): Promise<ReadonlySet<string>> {
    if (this.storage.filterCurrentConversationalMemoryIds) {
      return this.storage.filterCurrentConversationalMemoryIds(userId, candidateIds);
    }
    const all = await this.storage.listConversationalMemories(userId);
    const current = new Set(this.selectVisibleCurrent(all).map((memory) => memory.id));
    return new Set(candidateIds.filter((id) => current.has(id)));
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
    if (memory.sourceType === "plaid_transaction_profile") {
      if (!memory.observedThrough) return false;
      const observedThrough = Date.parse(`${memory.observedThrough.slice(0, 10)}T00:00:00.000Z`);
      const cutoff = now.getTime() - 90 * 86_400_000;
      return Number.isFinite(observedThrough) && observedThrough >= cutoff && observedThrough <= now.getTime();
    }
    const createdAt = Date.parse(memory.createdAt);
    return Number.isFinite(createdAt) && createdAt >= new Date(now).setUTCMonth(now.getUTCMonth() - 24) && createdAt <= now.getTime();
  }

  private async invalidateCachedMemory(userId: string): Promise<void> {
    const cache = this.storage as MemoryProvider & { invalidateUserMemoryCache?: (userId: string) => void };
    cache.invalidateUserMemoryCache?.(userId);
  }
}

function sourceTurnEvidenceMetadata(memory: ConversationalMemory): Readonly<Record<string, unknown>> {
  const references = memory.sourceMetadata?.sourceTurnReferences;
  if (!Array.isArray(references)) return {};
  const valid = normalizeSourceTurnReferences(references);
  return valid.length ? { sourceTurnReferences: Object.freeze([...valid]) } : {};
}

function memoryTurnIds(memory: Pick<ConversationalMemory, "sourceMetadata">): Set<string> {
  const references = memory.sourceMetadata?.sourceTurnReferences;
  if (!Array.isArray(references)) return new Set();
  return new Set(references.flatMap((reference) =>
    reference && typeof reference === "object" && "turnId" in reference &&
    typeof reference.turnId === "string" && reference.turnId.trim()
      ? [reference.turnId]
      : []));
}

function mergeSourceTurnEvidence(
  prior: ConversationalMemory | undefined,
  incoming: Readonly<Record<string, unknown>> | undefined
): Readonly<Record<string, unknown>> {
  const references = [
    ...(Array.isArray(prior?.sourceMetadata?.sourceTurnReferences) ? prior.sourceMetadata.sourceTurnReferences : []),
    ...(Array.isArray(incoming?.sourceTurnReferences) ? incoming.sourceTurnReferences : [])
  ];
  const valid = normalizeSourceTurnReferences(references);
  return {
    ...incoming,
    ...(valid.length ? {
      sourceTurnReferences: Object.freeze([...new Map(valid.map((reference) => [reference.turnId, reference])).values()])
    } : {})
  };
}

function normalizeSourceTurnReferences(value: readonly unknown[]): Array<{ turnId: string; userMessage?: string }> {
  return value.flatMap((reference) => {
    if (!reference || typeof reference !== "object" || !("turnId" in reference) ||
        typeof reference.turnId !== "string" || !reference.turnId.trim()) return [];
    const userMessage = "userMessage" in reference && typeof reference.userMessage === "string" &&
      reference.userMessage.length <= 2_000 ? reference.userMessage : undefined;
    return [{ turnId: reference.turnId, ...(userMessage === undefined ? {} : { userMessage }) }];
  });
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
