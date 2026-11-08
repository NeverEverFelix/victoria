import type { AgentDecision } from "./types.js";

export interface PendingEntryCorrectionState {
  readonly userId: string;
  readonly conversationKey: string;
  readonly decision: AgentDecision;
  readonly approvalId?: string;
}

/** Owns process-local indexing for exact, user-scoped entry-correction proposals. */
export class PendingEntryCorrectionService {
  private readonly byAction = new Map<string, PendingEntryCorrectionState>();
  private readonly actionByConversation = new Map<string, string>();

  getForConversation(userId: string, conversationKey: string): { actionId: string; state: PendingEntryCorrectionState } | undefined {
    const actionId = this.actionByConversation.get(conversationKey);
    const state = actionId ? this.byAction.get(actionId) : undefined;
    if (!actionId || !state || state.userId !== userId || state.conversationKey !== conversationKey) return undefined;
    return { actionId, state };
  }

  getByAction(userId: string, actionId: string): PendingEntryCorrectionState | undefined {
    const state = this.byAction.get(actionId);
    return state?.userId === userId ? state : undefined;
  }

  set(actionId: string, state: PendingEntryCorrectionState): void {
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

  setApprovalId(userId: string, actionId: string, approvalId: string): boolean {
    const state = this.getByAction(userId, actionId);
    if (!state) return false;
    this.byAction.set(actionId, { ...state, approvalId });
    return true;
  }

  deleteByAction(actionId: string): PendingEntryCorrectionState | undefined {
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
  ): PendingEntryCorrectionState | undefined {
    const pending = this.getForConversation(userId, conversationKey);
    const createdAt = pending?.state.decision.entryCorrection?.createdAt;
    if (!pending || typeof createdAt !== "string" || !isExpired(createdAt)) return undefined;
    return this.deleteByAction(pending.actionId);
  }
}
