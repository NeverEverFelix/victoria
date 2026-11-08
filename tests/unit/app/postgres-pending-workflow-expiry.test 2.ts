import { describe, expect, it } from "vitest";
import type { PostgresClient, PostgresPool, PostgresQueryResult } from "../../../src/app/shared/postgres-types.js";
import { PostgresPendingGoalAllocationActionStore } from "../../../src/app/savings/postgres-pending-goal-allocation-store.js";
import { PostgresPendingEntryCorrectionStore } from "../../../src/app/savings/postgres-pending-entry-correction-store.js";
import { PostgresPendingSavingsActionStore } from "../../../src/app/savings/postgres-pending-savings-action-store.js";

describe("persistent pending workflow expiry", () => {
  it.each([
    ["savings", (pool: PostgresPool) => new PostgresPendingSavingsActionStore(pool).getPending("user", "conversation")],
    ["goal allocation", (pool: PostgresPool) => new PostgresPendingGoalAllocationActionStore(pool).getPending("user", "conversation")],
    ["entry correction", (pool: PostgresPool) => new PostgresPendingEntryCorrectionStore(pool).getPending("user", "conversation")]
  ])("bounds restored %s proposals to 24 hours", async (_kind, getPending) => {
    let querySql = "";
    const pool = createPool(async (sql) => {
      querySql = sql;
      return { rows: [], rowCount: 0 };
    });

    await getPending(pool);

    expect(querySql).toContain("p.created_at > now() - interval '24 hours'");
    expect(querySql).toContain("INSERT INTO victoria_local_");
    expect(querySql).toContain("'expired'");
    expect(querySql).toContain("ON CONFLICT");
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
    return { rows: result.rows as readonly Row[], ...(result.rowCount === undefined ? {} : { rowCount: result.rowCount }) };
  };
  const client: PostgresClient = { query, release() {} };
  return { query, async connect() { return client; } };
}
