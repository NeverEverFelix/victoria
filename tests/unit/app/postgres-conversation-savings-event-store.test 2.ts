import { describe, expect, it } from "vitest";
import type { SavingsEvent } from "../../../src/domain/savings/types.js";
import type { PostgresPool, PostgresQueryResult } from "../../../src/app/shared/postgres-types.js";
import { PostgresConversationSavingsEventStore } from "../../../src/app/savings/postgres-conversation-savings-event-store.js";

const event: SavingsEvent = {
  id: "event-1", userId: "user-1", type: "avoided_spend", summary: "Skipped a pastry",
  userProvidedAmountCents: 2_000, classificationConfidence: 0.95,
  createdAt: "2026-10-26T12:00:00.000Z"
};

describe("PostgresConversationSavingsEventStore", () => {
  it("lists events with both user and conversation predicates", async () => {
    let query: { sql: string; values?: readonly unknown[] } | undefined;
    const store = new PostgresConversationSavingsEventStore(createPool(async (sql, values) => {
      query = { sql, ...(values ? { values } : {}) };
      return { rows: [{
        event_id: "event-1", user_id: "user-1", conversation_id: "conversation-1", event_type: "avoided_spend",
        summary: "Skipped a pastry", merchant_name: null, user_provided_amount_cents: "2000",
        classification_confidence: 0.95, created_at: event.createdAt
      }], rowCount: 1 };
    }));

    await expect(store.list("user-1", "conversation-1")).resolves.toEqual([event]);
    expect(query?.sql).toContain("WHERE user_id = $1 AND conversation_id = $2");
    expect(query?.values).toEqual(["user-1", "conversation-1"]);
  });

  it("appends idempotently within a conversation and scopes duplicate IDs by conversation", async () => {
    const calls: { sql: string; values?: readonly unknown[] }[] = [];
    let conversationId = "conversation-1";
    const store = new PostgresConversationSavingsEventStore(createPool(async (sql, values) => {
      calls.push({ sql, ...(values ? { values } : {}) });
      if (sql.includes("SELECT event_id, user_id")) return { rows: [{
        event_id: event.id, user_id: event.userId, conversation_id: conversationId, event_type: event.type,
        summary: event.summary, merchant_name: null, user_provided_amount_cents: "2000",
        classification_confidence: event.classificationConfidence, created_at: event.createdAt
      }], rowCount: 1 };
      return { rows: [], rowCount: 1 };
    }));

    await expect(store.record({ event, conversationId: "conversation-1" })).resolves.toBeUndefined();
    expect(calls[0]?.sql).toContain("ON CONFLICT (user_id, conversation_id, event_id) DO NOTHING");
    expect(calls[1]?.sql).toContain("WHERE user_id = $1 AND conversation_id = $2 AND event_id = $3");
    expect(calls[1]?.values).toEqual(["user-1", "conversation-1", "event-1"]);

    conversationId = "conversation-2";
    await expect(store.record({ event, conversationId: "conversation-2" })).resolves.toBeUndefined();
  });

  it("rejects stored amounts outside the safe cents range", async () => {
    const store = new PostgresConversationSavingsEventStore(createPool(async () => ({ rows: [{
      event_id: event.id, user_id: event.userId, conversation_id: "conversation-1", event_type: event.type,
      summary: event.summary, merchant_name: null, user_provided_amount_cents: "9007199254740992",
      classification_confidence: event.classificationConfidence, created_at: event.createdAt
    }], rowCount: 1 })));

    await expect(store.list("user-1", "conversation-1")).rejects.toThrow("invalid user-provided amount");
  });
});

function createPool(
  handler: (sql: string, values?: readonly unknown[]) => Promise<PostgresQueryResult<Record<string, unknown>>>
): PostgresPool {
  return {
    query: async <Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]) => {
      const result = await handler(sql, values);
      return { rows: result.rows as readonly Row[], ...(result.rowCount === undefined ? {} : { rowCount: result.rowCount }) };
    },
    async connect() { throw new Error("The event store should not require an open transaction."); }
  };
}
