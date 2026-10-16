import { randomUUID } from "node:crypto";
import type { AgentMemory, FinancialDecision, SavingsGoal, UserHabit } from "../types.js";
import { DEFAULT_CONVERSATION_CONTEXT_LIMIT, type ConversationalMemory, type MemoryProvider } from "./types.js";
import { immutableSnapshot } from "../../domain/immutable.js";

export class MockMemoryProvider implements MemoryProvider {
  private readonly decisionsByUser = new Map<string, FinancialDecision[]>();
  private readonly contextByConversation = new Map<string, readonly string[]>();
  private readonly memoriesByUser = new Map<string, ConversationalMemory[]>();
  private readonly pausedUsers = new Set<string>();
  private nextMemoryId = 1;
  private readonly goalsByAction = new Map<string, SavingsGoal>();

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
    return immutableSnapshot(this.goals.filter((goal) => goal.userId === userId));
  }

  async createSavingsGoal(userId: string, goal: Omit<SavingsGoal, "id" | "userId" | "savedAmountCents">, approvedActionId: string): Promise<SavingsGoal> {
    const key = `${userId}:${approvedActionId}`;
    const prior = this.goalsByAction.get(key);
    if (prior) {
      if (prior.name !== goal.name || prior.targetAmountCents !== goal.targetAmountCents || prior.currency !== goal.currency) throw new Error("An approved action cannot be reused for a different savings goal.");
      return immutableSnapshot(prior);
    }
    const normalizedName = goal.name.trim();
    if (!userId.trim() || !normalizedName || (goal.targetAmountCents !== undefined && (!Number.isSafeInteger(goal.targetAmountCents) || goal.targetAmountCents <= 0)) || goal.currency !== "USD") throw new Error("A savings goal requires a user, name, optional positive target, and USD currency.");
    const same = this.goals.find((item) => item.userId === userId && item.name.toLowerCase() === normalizedName.toLowerCase());
    if (same) {
      if (same.targetAmountCents !== goal.targetAmountCents || same.currency !== goal.currency) {
        throw new Error("A savings goal with this name already exists with different details.");
      }
      return immutableSnapshot(same);
    }
    const created = immutableSnapshot({ ...goal, id: `goal_${randomUUID()}`, userId, name: normalizedName, savedAmountCents: 0 });
    this.goals.push(created);
    this.goalsByAction.set(key, created);
    return created;
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
    const saved = immutableSnapshot({ ...memory, id: `memory_${this.nextMemoryId++}`, createdAt: new Date().toISOString() });
    userMemories.push(saved);
    this.memoriesByUser.set(userId, userMemories);
    return saved;
  }

  async forgetConversationalMemory(userId: string, memoryId: string): Promise<boolean> {
    const memories = this.memoriesByUser.get(userId) ?? [];
    const target = memories.find((memory) => memory.id === memoryId);
    if (!target || target.sourceType === "plaid_transaction_profile") return false;
    const removed = new Set([memoryId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const memory of memories) {
        if ((memory.supersedesId && removed.has(memory.supersedesId)) ||
            (typeof memory.sourceMetadata?.correctionOfMemoryId === "string" && removed.has(memory.sourceMetadata.correctionOfMemoryId))) {
          if (!removed.has(memory.id)) { removed.add(memory.id); changed = true; }
        }
        if (memory.supersedesId && removed.has(memory.id) && !removed.has(memory.supersedesId)) {
          removed.add(memory.supersedesId); changed = true;
        }
      }
    }
    this.memoriesByUser.set(userId, memories.filter((memory) => !removed.has(memory.id)));
    return true;
  }

  async forgetAllConversationalMemories(userId: string): Promise<number> {
    const memories = this.memoriesByUser.get(userId) ?? [];
    const kept = memories.filter((memory) => memory.sourceType === "plaid_transaction_profile");
    this.memoriesByUser.set(userId, kept);
    return memories.length - kept.length;
  }

  async isMemoryPaused(userId: string): Promise<boolean> { return this.pausedUsers.has(userId); }
  async setMemoryPaused(userId: string, paused: boolean): Promise<void> {
    if (paused) this.pausedUsers.add(userId);
    else this.pausedUsers.delete(userId);
  }
}

function isFreshProfileMemory(memory: ConversationalMemory, cutoff: number, now: number): boolean {
  if (!memory.observedThrough) return false;
  const observedThrough = Date.parse(`${memory.observedThrough.slice(0, 10)}T00:00:00.000Z`);
  return Number.isFinite(observedThrough) && observedThrough >= cutoff && observedThrough <= now;
}
