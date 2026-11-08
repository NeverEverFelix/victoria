import type { AgentDecision } from "./types.js";
import type { SavingsGoalAllocation } from "../domain/savings/types.js";

export interface PersistedPendingGoalAllocationAction {
  readonly actionId: string;
  readonly decision: AgentDecision;
  readonly approval?: SavingsGoalAllocation["approval"];
}

export interface PendingGoalAllocationActionStore {
  getPending(userId: string, conversationId: string): Promise<PersistedPendingGoalAllocationAction | null>;
  commit(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly pendingAction?: PersistedPendingGoalAllocationAction;
    readonly approvalAction?: {
      readonly actionId: string;
      readonly approval: SavingsGoalAllocation["approval"];
    };
    readonly terminalAction?: {
      readonly actionId: string;
      readonly status: "recorded" | "declined" | "superseded";
    };
  }): Promise<void>;
}
