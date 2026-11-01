import { describe, expect, it } from "vitest";
import type { AgentDecision } from "../../../src/agent/types.js";
import type { PostgresClient, PostgresPool, PostgresQueryResult } from "../../../src/app/shared/postgres-types.js";
import { PostgresPendingSavingsActionStore } from "../../../src/app/savings/postgres-pending-savings-action-store.js";

const decision = {
  action: "suggest_savings",
  proposal: {
    id: "proposal-1", userId: "user-1", eventId: "event-1", actionId: "action-1",
    status: "pending", createdAt: "2026-10-26T12:00:00.000Z",
    suggestion: { amountCents: 2_000, currency: "USD", reason: "Skipped a pastry", movementMode: "mock_ledger" }
  },
  toolCall: { name: "createSavingsEntry", actionId: "action-1", requiresApproval: true, arguments: {} },
  savingsEvent: { id: "event-1", userId: "user-1", type: "avoided_spend", summary: "Skipped a pastry" },
  suggestion: { amountCents: 2_000, movementMode: "mock_ledger" }
} as unknown as AgentDecision;

describe("PostgresPendingSavingsActionStore", () => {
  it("restores the append-only revision clarification marker with the pending proposal", async () => {
    const pool = createPool(async (sql) => sql.includes("SELECT p.action_id, p.decision")
      ? {
          rows: [{ action_id: "action-1", decision, awaiting_valid_revision: true }],
          rowCount: 1
        }
      : { rows: [], rowCount: 0 });
    const store = new PostgresPendingSavingsActionStore(pool);

    await expect(store.getPending("user-1", "conversation-1")).resolves.toEqual({
      actionId: "action-1", decision, awaitingValidRevision: true
    });
  });

  it("restores a target clarification separately from an amount clarification", async () => {
    const pool = createPool(async (sql) => sql.includes("SELECT p.action_id, p.decision")
      ? {
          rows: [{ action_id: "action-1", decision, awaiting_valid_revision: false, awaiting_revision_target: true }],
          rowCount: 1
        }
      : { rows: [], rowCount: 0 });
    const store = new PostgresPendingSavingsActionStore(pool);

    await expect(store.getPending("user-1", "conversation-1")).resolves.toEqual({
      actionId: "action-1", decision, awaitingRevisionTarget: true
    });
  });

  it("appends the clarification marker in the same transaction as the proposal snapshot", async () => {
    const calls: { sql: string; values?: readonly unknown[] }[] = [];
    const handler = async (sql: string, values?: readonly unknown[]): Promise<PostgresQueryResult<Record<string, unknown>>> => {
      calls.push({ sql, ...(values ? { values } : {}) });
      return { rows: [], rowCount: 0 };
    };
    const store = new PostgresPendingSavingsActionStore(createPool(handler));

    await store.commit({
      userId: "user-1",
      conversationId: "conversation-1",
      pendingAction: { actionId: "action-1", decision, awaitingValidRevision: true },
      responseDecision: decision
    });

    const marker = calls.find((call) => call.sql.includes("INSERT INTO victoria_local_savings_revision_clarifications"));
    expect(marker?.sql).toContain("ON CONFLICT (user_id, action_id) DO NOTHING");
    expect(marker?.values?.slice(0, 5)).toEqual([
      "action-1:revision-amount", "user-1", "conversation-1", "proposal-1", "action-1"
    ]);
    expect(marker?.values?.[5]).toEqual(expect.any(String));
    expect(calls[0]?.sql).toBe("BEGIN");
    expect(calls.at(-1)?.sql).toBe("COMMIT");
  });

  it("appends a separate immutable target clarification marker", async () => {
    const calls: { sql: string; values?: readonly unknown[] }[] = [];
    const handler = async (sql: string, values?: readonly unknown[]): Promise<PostgresQueryResult<Record<string, unknown>>> => {
      calls.push({ sql, ...(values ? { values } : {}) });
      return { rows: [], rowCount: 0 };
    };
    const store = new PostgresPendingSavingsActionStore(createPool(handler));

    await store.commit({
      userId: "user-1", conversationId: "conversation-1",
      pendingAction: { actionId: "action-1", decision, awaitingRevisionTarget: true },
      responseDecision: decision
    });

    const marker = calls.find((call) => call.sql.includes("INSERT INTO victoria_local_savings_revision_target_clarifications"));
    expect(marker?.sql).toContain("ON CONFLICT (user_id, action_id) DO NOTHING");
    expect(marker?.values?.slice(0, 5)).toEqual([
      "action-1:revision-target", "user-1", "conversation-1", "proposal-1", "action-1"
    ]);
    expect(calls.at(-1)?.sql).toBe("COMMIT");
  });
});

function createPool(
  handler: (sql: string, values?: readonly unknown[]) => Promise<PostgresQueryResult<unknown>>
): PostgresPool {
  const query = async <Row = Record<string, unknown>>(
    sql: string,
    values?: readonly unknown[]
  ): Promise<PostgresQueryResult<Row>> => {
    const result = await handler(sql, values);
    return {
      rows: result.rows as readonly Row[],
      ...(result.rowCount === undefined ? {} : { rowCount: result.rowCount })
    };
  };
  const client: PostgresClient = {
    query,
    release() {}
  };
  return {
    query,
    async connect() { return client; }
  };
}
