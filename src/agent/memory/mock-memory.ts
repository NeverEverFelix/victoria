import type { AgentMemory, FinancialDecision, SavingsGoal, UserHabit } from "../types.js";
import type { MemoryProvider } from "./types.js";

export class MockMemoryProvider implements MemoryProvider {
  private readonly decisions: FinancialDecision[] = [];

  constructor(
    private readonly habits: UserHabit[] = [],
    private readonly goals: SavingsGoal[] = []
  ) {}

  async getMemoryForUser(userId: string): Promise<AgentMemory> {
    return {
      habits: await this.listHabits(userId),
      goals: await this.listGoals(userId),
      recentDecisions: this.decisions
    };
  }

  async rememberDecision(
    _userId: string,
    decision: Omit<FinancialDecision, "id" | "createdAt">
  ): Promise<FinancialDecision> {
    const rememberedDecision: FinancialDecision = {
      ...decision,
      id: `decision_${this.decisions.length + 1}`,
      createdAt: new Date().toISOString()
    };

    this.decisions.push(rememberedDecision);
    return rememberedDecision;
  }

  async listHabits(_userId: string): Promise<UserHabit[]> {
    return this.habits;
  }

  async listGoals(_userId: string): Promise<SavingsGoal[]> {
    return this.goals;
  }
}

