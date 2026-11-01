import type { AgentRequest } from "./types.js";
import type { PendingAmountClarification, PendingAmountClarificationStore } from "./pending-amount-clarification-store.js";

/** Owns user/conversation scoping for a pending request to clarify a savings amount. */
export class PendingAmountClarificationService {
  private readonly local = new Map<string, { userId: string; value: PendingAmountClarification }>();

  constructor(private readonly store?: PendingAmountClarificationStore) {}

  async get(request: AgentRequest): Promise<PendingAmountClarification | undefined> {
    if (this.store) {
      const pending = await this.store.get(request.userId, conversationId(request));
      return isValidPending(pending, request.userId) ? pending : undefined;
    }
    const local = this.local.get(key(request));
    return local?.userId === request.userId && isValidPending(local.value, request.userId)
      ? local.value : undefined;
  }

  async set(request: AgentRequest, value: PendingAmountClarification): Promise<void> {
    if (this.store) {
      await this.store.set(request.userId, conversationId(request), value);
      return;
    }
    this.local.set(key(request), { userId: request.userId, value });
  }

  async clear(request: AgentRequest): Promise<void> {
    if (this.store) {
      await this.store.clear(request.userId, conversationId(request));
      return;
    }
    this.local.delete(key(request));
  }
}

function isValidPending(value: PendingAmountClarification | null | undefined, userId: string): value is PendingAmountClarification {
  return value?.classification.type === "avoided_spend" && value.savingsEvent.type === "avoided_spend" &&
    value.savingsEvent.userId === userId;
}

function conversationId(request: AgentRequest): string {
  return request.conversationId ?? "default";
}

function key(request: AgentRequest): string {
  return JSON.stringify([request.userId, conversationId(request)]);
}
