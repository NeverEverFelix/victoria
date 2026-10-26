import { describe, expect, it } from "vitest";
import { InMemoryConversationSavingsEventStore } from "../../../src/agent/savings-event-store.js";
import type { SavingsEvent } from "../../../src/domain/savings/types.js";

const event: SavingsEvent = {
  id: "event-1", userId: "user-1", type: "avoided_spend", summary: "Skipped a pastry",
  userProvidedAmountCents: 2_000, classificationConfidence: 0.95,
  createdAt: "2026-10-26T12:00:00.000Z"
};

describe("InMemoryConversationSavingsEventStore", () => {
  it("returns only immutable events for the exact user and conversation", async () => {
    const store = new InMemoryConversationSavingsEventStore();
    await store.record({ event, conversationId: "conversation-1" });
    await store.record({ event: { ...event, id: "event-2" }, conversationId: "conversation-2" });

    const events = await store.list("user-1", "conversation-1");
    expect(events).toEqual([event]);
    expect(Object.isFrozen(events)).toBe(true);
    expect(Object.isFrozen(events[0])).toBe(true);
    await expect(store.list("other-user", "conversation-1")).resolves.toEqual([]);
    await expect(store.list("user-1", "conversation-2")).resolves.toMatchObject([{ id: "event-2" }]);
  });

  it("treats identical event appends as idempotent and rejects ID reuse", async () => {
    const store = new InMemoryConversationSavingsEventStore();
    await store.record({ event, conversationId: "conversation-1" });
    await expect(store.record({ event: { ...event }, conversationId: "conversation-1" })).resolves.toBeUndefined();
    await expect(store.record({ event: { ...event, summary: "Different event" }, conversationId: "conversation-1" }))
      .rejects.toThrow("cannot be reused");
    await expect(store.record({ event, conversationId: "conversation-2" })).rejects.toThrow("cannot be reused");
  });

  it("rejects unscoped or malformed event records", async () => {
    const store = new InMemoryConversationSavingsEventStore();
    await expect(store.record({ event, conversationId: " " })).rejects.toThrow("valid scoped");
    await expect(store.record({ event: { ...event, userProvidedAmountCents: 0 }, conversationId: "conversation-1" }))
      .rejects.toThrow("valid scoped");
  });
});
