import type { SavingsGoalAllocation } from "../domain/savings/types.js";
import type { AgentDecision } from "./types.js";

export interface PendingGoalAllocationState {
  readonly userId: string;
  readonly conversationKey: string;
  readonly decision: AgentDecision;
  readonly approval?: SavingsGoalAllocation["approval"];
}

/** Owns process-local indexing for user-scoped pending goal-allocation proposals. */
export class PendingGoalAllocationService {
  private readonly byAction = new Map<string, PendingGoalAllocationState>();
  private readonly actionByConversation = new Map<string, string>();

  getForConversation(userId: string, conversationKey: string): { actionId: string; state: PendingGoalAllocationState } | undefined {
    const actionId = this.actionByConversation.get(conversationKey);
    const state = actionId ? this.byAction.get(actionId) : undefined;
    if (!actionId || !state || state.userId !== userId || state.conversationKey !== conversationKey) return undefined;
    return { actionId, state };
  }

  getByAction(userId: string, actionId: string): PendingGoalAllocationState | undefined {
    const state = this.byAction.get(actionId);
    return state?.userId === userId ? state : undefined;
  }

  set(actionId: string, state: PendingGoalAllocationState): void {
    const priorActionId = this.actionByConversation.get(state.conversationKey);
    if (priorActionId && priorActionId !== actionId) this.byAction.delete(priorActionId);
    const priorState = this.byAction.get(actionId);
    if (priorState && priorState.conversationKey !== state.conversationKey &&
        this.actionByConversation.get(priorState.conversationKey) === actionId) {
      this.actionByConversation.delete(priorState.conversationKey);
    }
    this.byAction.set(actionId, state);
    this.actionByConversation.set(state.conversationKey, actionId);
  }

  setApproval(userId: string, actionId: string, approval: SavingsGoalAllocation["approval"]): boolean {
    const state = this.getByAction(userId, actionId);
    if (!state) return false;
    this.byAction.set(actionId, { ...state, approval });
    return true;
  }

  deleteByAction(actionId: string): PendingGoalAllocationState | undefined {
    const state = this.byAction.get(actionId);
    if (!state) return undefined;
    this.byAction.delete(actionId);
    if (this.actionByConversation.get(state.conversationKey) === actionId) {
      this.actionByConversation.delete(state.conversationKey);
    }
    return state;
  }

  expireForConversation(
    userId: string,
    conversationKey: string,
    isExpired: (createdAt: string) => boolean
  ): PendingGoalAllocationState | undefined {
    const pending = this.getForConversation(userId, conversationKey);
    const createdAt = pending?.state.decision.goalAllocation?.createdAt;
    if (!pending || typeof createdAt !== "string" || !isExpired(createdAt)) return undefined;
    return this.deleteByAction(pending.actionId);
  }
}
