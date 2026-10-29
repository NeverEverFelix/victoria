import type { AgentMemory, FinancialDecision, SavingsGoal, UserHabit } from "../types.js";
import { DEFAULT_CONVERSATION_CONTEXT_LIMIT, type ConversationalMemory, type ConversationalMemoryPage, type MemoryProvider } from "./types.js";
import { immutableSnapshot } from "../../domain/immutable.js";
import { conversationMessagesFromLegacy, legacyConversationContext } from "./conversation-transcript.js";
import type { ConversationMessage } from "./types.js";

export class MockMemoryProvider implements MemoryProvider {
  private readonly decisionsByUser = new Map<string, FinancialDecision[]>();
  private readonly contextByConversation = new Map<string, readonly string[]>();
  private readonly messagesByConversation = new Map<string, readonly ConversationMessage[]>();
  private readonly memoriesByUser = new Map<string, ConversationalMemory[]>();

  constructor(
    private readonly habits: UserHabit[] = [],
    private readonly goals: SavingsGoal[] = []
  ) {}

  async getMemoryForUser(userId: string, query?: string): Promise<AgentMemory> {
    const conversationalMemories = query
      ? await this.searchConversationalMemories(userId, query)
      : await this.listCurrentConversationalMemories(userId);
    return {
      habits: await this.listHabits(userId),
      goals: await this.listGoals(userId),
      recentDecisions: immutableSnapshot(this.decisionsByUser.get(userId) ?? []),
      conversationalMemories
    };
  }

  async rememberDecision(
    userId: string,
    decision: Omit<FinancialDecision, "id" | "createdAt">
  ): Promise<FinancialDecision> {
    const decisions = this.decisionsByUser.get(userId) ?? [];
    const rememberedDecision: FinancialDecision = immutableSnapshot({
      ...decision,
      id: `decision_${decisions.length + 1}`,
      createdAt: new Date().toISOString()
    });

    decisions.push(rememberedDecision);
    this.decisionsByUser.set(userId, decisions);
    return rememberedDecision;
  }

  async listHabits(userId: string): Promise<UserHabit[]> {
    return this.habits.filter((habit) => habit.userId === userId);
  }

  async listGoals(userId: string): Promise<SavingsGoal[]> {
    return this.goals.filter((goal) => goal.userId === userId);
  }

  async getConversationContext(userId: string, conversationId: string): Promise<readonly string[]> {
    const key = `${userId}:${conversationId}`;
    const structured = this.messagesByConversation.get(key);
    return structured ? legacyConversationContext(structured) : this.contextByConversation.get(key) ?? [];
  }

  async setConversationContext(userId: string, conversationId: string, messages: readonly string[]): Promise<void> {
    const key = `${userId}:${conversationId}`;
    const bounded = messages.slice(-DEFAULT_CONVERSATION_CONTEXT_LIMIT);
    this.contextByConversation.set(key, immutableSnapshot(bounded));
    this.messagesByConversation.delete(key);
  }

  async getConversationMessages(userId: string, conversationId: string): Promise<readonly ConversationMessage[]> {
    const key = `${userId}:${conversationId}`;
    const structured = this.messagesByConversation.get(key);
    return structured ?? conversationMessagesFromLegacy(conversationId, this.contextByConversation.get(key) ?? []);
  }

  async setConversationMessages(userId: string, conversationId: string, messages: readonly ConversationMessage[]): Promise<void> {
    const key = `${userId}:${conversationId}`;
    const bounded = immutableSnapshot(messages.slice(-DEFAULT_CONVERSATION_CONTEXT_LIMIT));
    this.messagesByConversation.set(key, bounded);
    this.contextByConversation.set(key, legacyConversationContext(bounded));
  }

  async listConversationalMemories(userId: string): Promise<readonly ConversationalMemory[]> {
    return immutableSnapshot(this.memoriesByUser.get(userId) ?? []);
  }

  async listCurrentConversationalMemories(
    userId: string,
    includeForgottenMarkers = false,
    page?: ConversationalMemoryPage
  ): Promise<readonly ConversationalMemory[]> {
    const memories = this.memoriesByUser.get(userId) ?? [];
    const supersededIds = new Set(memories.flatMap((memory) => memory.supersedesId ? [memory.supersedesId] : []));
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    let current = memories.filter((memory) => !supersededIds.has(memory.id) &&
      (memory.sourceType !== "plaid_transaction_profile" || isFreshProfileMemory(memory, cutoff, Date.now())));
    if (!includeForgottenMarkers) {
      const forgottenKeys = new Set(current.filter((memory) => memory.sourceMetadata?.memoryStatus === "forgotten")
        .map((memory) => `${memory.category}\u0000${memory.key}`));
      current = current.filter((memory) => memory.sourceMetadata?.memoryStatus !== "forgotten" &&
        !forgottenKeys.has(`${memory.category}\u0000${memory.key}`));
    }
    const selected = new Map<string, ConversationalMemory>();
    for (const memory of current) {
      const identity = `${memory.category}\u0000${memory.key}`;
      const previous = selected.get(identity);
      if (!previous || mockMemoryAuthority(memory) > mockMemoryAuthority(previous) ||
          (mockMemoryAuthority(memory) === mockMemoryAuthority(previous) && memory.createdAt > previous.createdAt)) {
        selected.set(identity, memory);
      }
    }
    current = [...selected.values()].sort((left, right) => right.createdAt.localeCompare(left.createdAt) || right.id.localeCompare(left.id));
    const before = page?.before;
    const paged = before ? current.filter((memory) => memory.createdAt < before.createdAt ||
      (memory.createdAt === before.createdAt && memory.id < before.id)) : current;
    return immutableSnapshot(paged.slice(0, page?.limit ?? 100));
  }

  async filterCurrentConversationalMemoryIds(userId: string, candidateIds: readonly string[]): Promise<ReadonlySet<string>> {
    const candidateSet = new Set(candidateIds);
    const current = await this.listCurrentConversationalMemories(userId, false, { limit: Number.MAX_SAFE_INTEGER });
    return new Set(current.filter((memory) => candidateSet.has(memory.id)).map((memory) => memory.id));
  }

  async searchConversationalMemories(userId: string, query: string, limit = 20): Promise<readonly ConversationalMemory[]> {
    const tokens = new Set(query.toLocaleLowerCase("en-US").split(/\W+/u).filter(Boolean));
    const memories = await this.listCurrentConversationalMemories(userId);
    return immutableSnapshot(memories
      .map((memory) => ({ memory, score: [...tokens].filter((token) =>
        `${memory.key} ${memory.value}`.toLocaleLowerCase("en-US").includes(token)).length }))
      .filter((item) => item.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(1, Math.min(limit, 50)))
      .map((item) => item.memory));
  }

  async rememberConversationalMemory(
    userId: string, memory: Omit<ConversationalMemory, "id" | "createdAt">
  ): Promise<ConversationalMemory> {
    if (!userId.trim() || !memory.key.trim() || !memory.value.trim() || !memory.evidence.trim() ||
        !Number.isFinite(memory.confidence) || memory.confidence < 0 || memory.confidence > 1 ||
        !["preference", "goal", "habit", "other", "financial_pattern"].includes(memory.category) ||
        (memory.sourceRecordCount !== undefined && (!Number.isSafeInteger(memory.sourceRecordCount) || memory.sourceRecordCount <= 0))) {
      throw new Error("Conversational memory requires a user, key, value, evidence, a valid category, confidence in [0, 1], and a positive safe source record count when provided.");
    }
    const userMemories = this.memoriesByUser.get(userId) ?? [];
    const saved = immutableSnapshot({ ...memory, id: `memory_${userMemories.length + 1}`, createdAt: new Date().toISOString() });
    userMemories.push(saved);
    this.memoriesByUser.set(userId, userMemories);
    return saved;
  }
}

function isFreshProfileMemory(memory: ConversationalMemory, cutoff: number, now: number): boolean {
  if (!memory.observedThrough) return false;
  const observedThrough = Date.parse(`${memory.observedThrough.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(observedThrough) && observedThrough >= cutoff && observedThrough <= now;
}

function mockMemoryAuthority(memory: ConversationalMemory): number {
  switch (memory.sourceType) {
    case "user_correction": return 4;
    case "user_statement": return 3;
    case "plaid_transaction_profile": return 2;
    case "system_inference": return 1;
    default: return 3;
  }
}
