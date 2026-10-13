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

  async getMemoryForUser(userId: string): Promise<AgentMemory> {
    return {
      habits: await this.listHabits(userId),
      goals: await this.listGoals(userId),
      recentDecisions: immutableSnapshot(this.decisionsByUser.get(userId) ?? [])
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

  async rememberConversationalMemory(
    userId: string, memory: Omit<ConversationalMemory, "id" | "createdAt">
  ): Promise<ConversationalMemory> {
    if (!userId.trim() || !memory.key.trim() || !memory.value.trim() || !memory.evidence.trim() ||
        !Number.isFinite(memory.confidence) || memory.confidence < 0 || memory.confidence > 1 ||
        !["preference", "goal", "habit", "other"].includes(memory.category)) {
      throw new Error("Conversational memory must have a user, key, value, evidence, and confidence from 0 to 1.");
    }
    const userMemories = this.memoriesByUser.get(userId) ?? [];
    const saved = immutableSnapshot({ ...memory, id: `memory_${userMemories.length + 1}`, createdAt: new Date().toISOString() });
    userMemories.push(saved);
    this.memoriesByUser.set(userId, userMemories);
    return saved;
  }
}
