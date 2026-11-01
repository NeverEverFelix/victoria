import type { SavingsEntry } from "../domain/savings/types.js";
import type { ConversationSavingsEventStore } from "./savings-event-store.js";

export interface SavingsEntriesReader {
  listSavingsEntries?: (userId: string) => Promise<readonly SavingsEntry[]>;
}

/** Resolves the latest completed mocked entry that belongs to the scoped conversation history. */
export async function getRecentConversationSavingsEntry(input: {
  readonly userId: string;
  readonly conversationId: string;
  readonly conversationKey: string;
  readonly cache: Map<string, SavingsEntry>;
  readonly eventStore?: ConversationSavingsEventStore;
  readonly tools: SavingsEntriesReader;
}): Promise<SavingsEntry | undefined> {
  const cached = input.cache.get(input.conversationKey);
  if (!input.eventStore || !input.conversationId) return cached?.userId === input.userId ? cached : undefined;

  const events = await input.eventStore.list(input.userId, input.conversationId);
  if (events.length === 0 || !input.tools.listSavingsEntries) {
    return events.length === 0 ? undefined : cached?.userId === input.userId ? cached : undefined;
  }
  const eventIds = new Set(events.map(({ id }) => id));
  const entries = await input.tools.listSavingsEntries(input.userId);
  const latest = entries
    .filter((entry) => entry.userId === input.userId && entry.status === "completed" &&
      entry.movementMode === "mock_ledger" && eventIds.has(entry.eventId))
    .sort((left, right) => Date.parse(right.createdAt) - Date.parse(left.createdAt) || right.id.localeCompare(left.id))[0];
  if (latest) input.cache.set(input.conversationKey, latest);
  return latest;
}
