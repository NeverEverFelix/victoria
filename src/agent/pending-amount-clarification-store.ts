import type { ClassifiedMessage, SavingsEvent } from "./types.js";

export interface PendingAmountClarification {
  readonly classification: ClassifiedMessage;
  readonly savingsEvent: SavingsEvent;
}

/** Ephemeral, user-and-conversation-scoped state awaiting a missing USD amount. */
export interface PendingAmountClarificationStore {
  get(userId: string, conversationId: string): Promise<PendingAmountClarification | null>;
  set(userId: string, conversationId: string, value: PendingAmountClarification): Promise<void>;
  clear(userId: string, conversationId: string): Promise<void>;
}
