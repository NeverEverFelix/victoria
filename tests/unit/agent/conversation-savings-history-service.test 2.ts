import { describe, expect, it, vi } from "vitest";
import type { SavingsEntry, SavingsEvent } from "../../../src/domain/savings/types.js";
import { InMemoryConversationSavingsEventStore } from "../../../src/agent/savings-event-store.js";
import { getRecentConversationSavingsEntry } from "../../../src/agent/conversation-savings-history-service.js";

function entry(input: Partial<SavingsEntry> & Pick<SavingsEntry, "id" | "userId" | "eventId" | "createdAt">): SavingsEntry {
  return {
    proposalId: `proposal_${input.id}`, approvalId: `approval_${input.id}`, approvedActionId: `action_${input.id}`,
    amountCents: 1_000, currency: "USD", reason: "Avoided a purchase", movementMode: "mock_ledger",
    status: "completed", ...input
  };
}

function event(id: string, userId: string, createdAt: string): SavingsEvent {
  return {
    id, userId, type: "avoided_spend", summary: "Skipped a purchase", classificationConfidence: 0.9, createdAt
  };
}

describe("getRecentConversationSavingsEntry", () => {
  it("selects and caches only the latest completed mocked entry referenced by scoped history", async () => {
    const eventStore = new InMemoryConversationSavingsEventStore();
    await eventStore.record({ conversationId: "chat-a", event: event("event-old", "user-a", "2026-10-01T00:00:00Z") });
    await eventStore.record({ conversationId: "chat-a", event: event("event-new", "user-a", "2026-10-02T00:00:00Z") });
    const entries = [
      entry({ id: "old", userId: "user-a", eventId: "event-old", createdAt: "2026-10-01T01:00:00Z" }),
      entry({ id: "new", userId: "user-a", eventId: "event-new", createdAt: "2026-10-02T01:00:00Z" }),
      entry({ id: "unscoped", userId: "user-a", eventId: "other-event", createdAt: "2026-10-03T01:00:00Z" }),
      entry({ id: "other-user", userId: "user-b", eventId: "event-new", createdAt: "2026-10-04T01:00:00Z" }),
      entry({ id: "pending", userId: "user-a", eventId: "event-new", createdAt: "2026-10-05T01:00:00Z", status: "pending" })
    ];
    const listSavingsEntries = vi.fn(async () => entries);
    const cache = new Map<string, SavingsEntry>();

    const result = await getRecentConversationSavingsEntry({
      userId: "user-a", conversationId: "chat-a", conversationKey: "user-a:chat-a", cache,
      eventStore, tools: { listSavingsEntries }
    });

    expect(result?.id).toBe("new");
    expect(cache.get("user-a:chat-a")?.id).toBe("new");
    expect(listSavingsEntries).toHaveBeenCalledExactlyOnceWith("user-a");
  });

  it("returns no cached entry when durable scoped history has no events", async () => {
    const eventStore = new InMemoryConversationSavingsEventStore();
    const cached = entry({ id: "cached", userId: "user-a", eventId: "event-old", createdAt: "2026-10-01T01:00:00Z" });
    const cache = new Map([["user-a:chat-a", cached]]);
    const listSavingsEntries = vi.fn(async () => [cached]);

    const result = await getRecentConversationSavingsEntry({
      userId: "user-a", conversationId: "chat-a", conversationKey: "user-a:chat-a", cache,
      eventStore, tools: { listSavingsEntries }
    });

    expect(result).toBeUndefined();
    expect(listSavingsEntries).not.toHaveBeenCalled();
  });
});
