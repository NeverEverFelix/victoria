import type { AgentDecision } from "./types.js";

export interface PersistedPendingEntryCorrection {
  readonly actionId: string;
  readonly decision: AgentDecision;
}

/** Durable, user-and-conversation-scoped correction awaiting exact approval. */
export interface PendingEntryCorrectionStore {
  getPending(userId: string, conversationId: string): Promise<PersistedPendingEntryCorrection | null>;
  commit(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly pendingAction?: PersistedPendingEntryCorrection;
    readonly terminalAction?: { readonly actionId: string; readonly status: "recorded" | "declined" | "superseded" };
  }): Promise<void>;
}
