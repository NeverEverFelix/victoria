import type { AgentMemory, FinancialDecision, SavingsGoal, UserHabit } from "../types.js";

export interface MemoryProvider {
  getMemoryForUser(userId: string): Promise<AgentMemory>;
  rememberDecision(userId: string, decision: Omit<FinancialDecision, "id" | "createdAt">): Promise<FinancialDecision>;
  listHabits(userId: string): Promise<UserHabit[]>;
  listGoals(userId: string): Promise<SavingsGoal[]>;
}

