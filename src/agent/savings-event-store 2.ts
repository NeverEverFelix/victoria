import type { SavingsEvent } from "../domain/savings/types.js";

export interface ConversationSavingsEventStore {
  /** Append an event once; identical retries are idempotent and conflicting IDs fail. */
  record(input: { readonly conversationId: string; readonly event: SavingsEvent }): Promise<void>;
  /** Return only events owned by this user in this conversation, oldest first. */
  list(userId: string, conversationId: string): Promise<readonly SavingsEvent[]>;
}

export class InMemoryConversationSavingsEventStore implements ConversationSavingsEventStore {
  private readonly events = new Map<string, { readonly conversationId: string; readonly event: SavingsEvent }>();

  async record(input: { readonly conversationId: string; readonly event: SavingsEvent }): Promise<void> {
    validateEvent(input.event, input.conversationId);
    const key = eventKey(input.event.userId, input.conversationId, input.event.id);
    const current = this.events.get(key);
    if (current) {
      if (current.conversationId !== input.conversationId || !sameEvent(current.event, input.event)) {
        throw new Error("A savings event ID cannot be reused for a different event in the same conversation.");
      }
      return;
    }
    this.events.set(key, Object.freeze({
      conversationId: input.conversationId,
      event: Object.freeze({ ...input.event })
    }));
  }

  async list(userId: string, conversationId: string): Promise<readonly SavingsEvent[]> {
    if (!userId.trim() || !conversationId.trim()) return Object.freeze([]);
    return Object.freeze([...this.events.values()]
      .filter((record) => record.event.userId === userId && record.conversationId === conversationId)
      .map((record) => Object.freeze({ ...record.event }))
      .sort((left, right) => Date.parse(left.createdAt) - Date.parse(right.createdAt) || left.id.localeCompare(right.id)));
  }
}

export function validateEvent(event: SavingsEvent, conversationId: string): void {
  if (!conversationId.trim() || !event.userId.trim() || !event.id.trim() || event.type !== "avoided_spend" ||
      !event.summary.trim() || event.summary.length > 500 || !Number.isFinite(event.classificationConfidence) ||
      event.classificationConfidence < 0 || event.classificationConfidence > 1 ||
      !Number.isFinite(Date.parse(event.createdAt)) ||
      (event.merchantName !== undefined && (!event.merchantName.trim() || event.merchantName.length > 120)) ||
      (event.userProvidedAmountCents !== undefined &&
        (!Number.isSafeInteger(event.userProvidedAmountCents) || event.userProvidedAmountCents <= 0))) {
    throw new Error("A conversation savings event must contain valid scoped, sourced event data.");
  }
}

export function sameEvent(left: SavingsEvent, right: SavingsEvent): boolean {
  return left.id === right.id && left.userId === right.userId && left.type === right.type &&
    left.summary === right.summary && left.merchantName === right.merchantName &&
    left.userProvidedAmountCents === right.userProvidedAmountCents &&
    left.classificationConfidence === right.classificationConfidence &&
    Date.parse(left.createdAt) === Date.parse(right.createdAt);
}

function eventKey(userId: string, conversationId: string, eventId: string): string {
  return `${userId}\u0000${conversationId}\u0000${eventId}`;
}
