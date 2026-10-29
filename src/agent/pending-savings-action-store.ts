import type { AgentDecision } from "./types.js";

export interface PersistedPendingSavingsAction {
  readonly actionId: string;
  readonly decision: AgentDecision;
  /** True once this action has requested an unambiguous amount for a proposed revision. */
  readonly awaitingValidRevision?: boolean;
  /** True when the user may be referring to an older/non-active event; only decline can resolve this state. */
  readonly awaitingRevisionTarget?: boolean;
}

/** Persistence seam for the exact pending proposal required by local savings confirmation. */
export interface PendingSavingsActionStore {
  getPending(userId: string, conversationId: string): Promise<PersistedPendingSavingsAction | null>;
  commit(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly pendingAction?: PersistedPendingSavingsAction;
    readonly responseDecision: AgentDecision;
  }): Promise<void>;
}
