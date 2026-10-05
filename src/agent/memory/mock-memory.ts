import type { AgentMemory, FinancialDecision, SavingsGoal, UserHabit } from "../types.js";
import type { MemoryProvider } from "./types.js";
import { immutableSnapshot } from "../../domain/immutable.js";

export class MockMemoryProvider implements MemoryProvider {
  private readonly decisionsByUser = new Map<string, FinancialDecision[]>();

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
}
