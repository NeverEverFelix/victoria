import type { AgentMemory, FinancialDecision, SavingsGoal, UserHabit } from "../types.js";
import { DEFAULT_CONVERSATION_CONTEXT_LIMIT, type ConversationalMemory, type MemoryProvider } from "./types.js";
import { immutableSnapshot } from "../../domain/immutable.js";

export class MockMemoryProvider implements MemoryProvider {
  private readonly decisionsByUser = new Map<string, FinancialDecision[]>();
  private readonly contextByConversation = new Map<string, readonly string[]>();
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
    return this.contextByConversation.get(`${userId}:${conversationId}`) ?? [];
  }

  async setConversationContext(userId: string, conversationId: string, messages: readonly string[]): Promise<void> {
    this.contextByConversation.set(`${userId}:${conversationId}`, immutableSnapshot(messages.slice(-DEFAULT_CONVERSATION_CONTEXT_LIMIT)));
  }

  async listConversationalMemories(userId: string): Promise<readonly ConversationalMemory[]> {
    return immutableSnapshot(this.memoriesByUser.get(userId) ?? []);
  }

  async erasePlaidFinancialProfile(userId: string): Promise<void> {
    const memories = this.memoriesByUser.get(userId) ?? [];
    const plaidIds = new Set(memories.filter((memory) => memory.sourceType === "plaid_transaction_profile").map((memory) => memory.id));
    this.memoriesByUser.set(userId, memories.filter((memory) => memory.sourceType !== "plaid_transaction_profile")
      .map((memory) => {
        if (!memory.supersedesId || !plaidIds.has(memory.supersedesId)) return memory;
        const detached = Object.fromEntries(Object.entries(memory).filter(([key]) => key !== "supersedesId")) as ConversationalMemory;
        return immutableSnapshot(detached);
      }));
  }

  private async listCurrentConversationalMemories(userId: string): Promise<readonly ConversationalMemory[]> {
    const memories = this.memoriesByUser.get(userId) ?? [];
    const supersededIds = new Set(memories.flatMap((memory) => memory.supersedesId ? [memory.supersedesId] : []));
    const cutoff = Date.now() - 90 * 24 * 60 * 60 * 1000;
    return immutableSnapshot(memories.filter((memory) => !supersededIds.has(memory.id) &&
      (memory.sourceType !== "plaid_transaction_profile" || isFreshProfileMemory(memory, cutoff, Date.now()))));
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
