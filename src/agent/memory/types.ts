import type { AgentMemory, FinancialDecision, SavingsGoal, UserHabit } from "../types.js";

export interface MemoryProvider {
  getMemoryForUser(userId: string): Promise<AgentMemory>;
  rememberDecision(userId: string, decision: Omit<FinancialDecision, "id" | "createdAt">): Promise<FinancialDecision>;
  listHabits(userId: string): Promise<UserHabit[]>;
  listGoals(userId: string): Promise<SavingsGoal[]>;
  getConversationContext(userId: string, conversationId: string): Promise<readonly string[]>;
  setConversationContext(userId: string, conversationId: string, messages: readonly string[]): Promise<void>;
  listConversationalMemories(userId: string): Promise<readonly ConversationalMemory[]>;
  rememberConversationalMemory(userId: string, memory: Omit<ConversationalMemory, "id" | "createdAt">): Promise<ConversationalMemory>;
}

/** A durable, user-scoped preference or other fact learned from conversation. */
export interface ConversationalMemory {
  readonly id: string;
  readonly category: "preference" | "goal" | "habit" | "other";
  readonly key: string;
  readonly value: string;
  readonly evidence: string;
  readonly confidence: number;
  readonly createdAt: string;
  readonly supersedesId?: string;
}

export const DEFAULT_CONVERSATION_CONTEXT_LIMIT = 20;
