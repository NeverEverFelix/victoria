import type { AgentDecision } from "./types.js";

export interface PersistedPendingSavingsAction {
  readonly actionId: string;
  readonly decision: AgentDecision;
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
