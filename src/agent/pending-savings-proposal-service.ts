import type { SavingsApproval } from "../domain/savings/types.js";
import { transitionSavingsProposal } from "../domain/savings/proposal-lifecycle.js";
import { buildActiveSavingsConversationState } from "./conversation-state-manager.js";
import { recoverPendingPlanningHorizon } from "./conversation-dialogue-policy.js";
import type { AgentDecision, AgentRequest } from "./types.js";

export interface PendingSavingsProposalState {
  readonly userId: string;
  readonly conversationKey: string;
  readonly decision: AgentDecision;
  readonly awaitingValidRevision?: boolean;
  readonly awaitingRevisionTarget?: boolean;
  readonly approval?: SavingsApproval;
}

/** Owns process-local indexes and retry metadata for pending savings proposals. */
export class PendingSavingsProposalService {
  private readonly byAction = new Map<string, PendingSavingsProposalState>();
  private readonly actionByConversation = new Map<string, string>();

  getForConversation(userId: string, conversationKey: string): { actionId: string; state: PendingSavingsProposalState } | undefined {
    const actionId = this.actionByConversation.get(conversationKey);
    const state = actionId ? this.byAction.get(actionId) : undefined;
    if (!actionId || !state || state.userId !== userId || state.conversationKey !== conversationKey) return undefined;
    return { actionId, state };
  }

  /** Restore the proposal's scoped planning choice and typed workflow snapshot together. */
  getContextForConversation(userId: string, conversationKey: string, recentTurns: readonly string[]): {
    readonly actionId: string;
    readonly state: PendingSavingsProposalState;
    readonly workflowState?: ReturnType<typeof buildActiveSavingsConversationState>;
  } | undefined {
    const pending = this.getForConversation(userId, conversationKey);
    if (!pending) return undefined;
    const recoveredDecision = recoverPendingPlanningHorizon(pending.state.decision, recentTurns);
    const state = recoveredDecision === pending.state.decision
      ? pending.state
      : { ...pending.state, decision: recoveredDecision };
    if (state !== pending.state) this.set(pending.actionId, state);
    const workflowState = buildActiveSavingsConversationState(pending.actionId, state.decision, {
      ...(state.awaitingValidRevision ? { awaitingValidRevision: true } : {}),
      ...(state.awaitingRevisionTarget ? { awaitingRevisionTarget: true } : {})
    });
    return {
      actionId: pending.actionId,
      state,
      ...(workflowState ? { workflowState } : {})
    };
  }

  getByAction(userId: string, actionId: string): PendingSavingsProposalState | undefined {
    const state = this.byAction.get(actionId);
    return state?.userId === userId ? state : undefined;
  }

  set(actionId: string, state: PendingSavingsProposalState): void {
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

  setApproval(userId: string, actionId: string, approval: SavingsApproval): boolean {
    const state = this.getByAction(userId, actionId);
    if (!state) return false;
    this.byAction.set(actionId, { ...state, approval });
    return true;
  }

  /** Finalize an explicit decline and remove only that user's matching pending proposal. */
  decline(input: {
    readonly request: AgentRequest;
    readonly actionId: string;
    readonly transitionId: string;
    readonly createdAt: string;
  }): {
    readonly proposal?: NonNullable<AgentDecision["proposal"]>;
    readonly proposalTransitions?: NonNullable<AgentDecision["proposalTransitions"]>;
  } | undefined {
    const { request, actionId, transitionId, createdAt } = input;
    const pending = this.getByAction(request.userId, actionId);
    const conversationKey = JSON.stringify([request.userId, request.conversationId ?? "default"]);
    if (!pending || pending.conversationKey !== conversationKey ||
        pending.decision.toolCall?.actionId !== actionId) return undefined;
    const proposal = pending.decision.proposal;
    let declinedProposal: NonNullable<AgentDecision["proposal"]> | undefined;
    let proposalTransitions = pending.decision.proposalTransitions ?? [];
    if (proposal?.status === "pending") {
      const transition = transitionSavingsProposal(proposal, {
        id: transitionId,
        userId: request.userId,
        actionId,
        createdAt,
        to: "declined"
      });
      declinedProposal = transition.proposal;
      proposalTransitions = [...proposalTransitions, transition.transition];
    }
    this.deleteByAction(actionId);
    return {
      ...(declinedProposal ? { proposal: declinedProposal } : {}),
      ...(proposalTransitions.length ? { proposalTransitions } : {})
    };
  }

  deleteByAction(actionId: string): PendingSavingsProposalState | undefined {
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
  ): PendingSavingsProposalState | undefined {
    const pending = this.getForConversation(userId, conversationKey);
    const createdAt = pending?.state.decision.proposal?.createdAt;
    if (!pending || typeof createdAt !== "string" || !isExpired(createdAt)) return undefined;
    return this.deleteByAction(pending.actionId);
  }
}
