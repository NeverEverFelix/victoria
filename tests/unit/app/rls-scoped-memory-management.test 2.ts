import { describe, expect, it, vi } from "vitest";
import { createRlsScopedMemoryManagement } from "../../../src/app/http/rls-scoped-memory-management.js";
import type { PostgresClient, PostgresPool, PostgresQueryResult } from "../../../src/app/shared/postgres-types.js";

describe("RLS-scoped memory management", () => {
  it("sets a verified subject and restricted role for each database transaction", async () => {
    const calls: { sql: string; values: readonly unknown[] }[] = [];
    const client: PostgresClient = {
      async query<Row>(sql: string, values: readonly unknown[] = []): Promise<PostgresQueryResult<Row>> {
        calls.push({ sql, values });
        return { rows: sql.includes("WITH selected_memories") ? [{
          id: "memory-a", category: "preference", key: "reply_style", value: "Concise replies.",
          evidence: "The user requested concise replies.", confidence: 1,
          createdAt: "2026-10-18T12:00:00.000Z", sourceType: "user_statement"
        }] as Row[] : [] };
      },
      release: vi.fn()
    };
    const pool: PostgresPool = {
      query: client.query,
      connect: async () => client
    };
    const memory = createRlsScopedMemoryManagement(pool)("verified-user-a");

    const result = await memory.listConversationalMemories("verified-user-a", { limit: 25 });

    expect(result).toMatchObject([{ id: "memory-a", value: "Concise replies." }]);
    expect(calls.map((call) => call.sql)).toEqual([
      "BEGIN",
      "SET LOCAL ROLE victoria_memory_api",
      "SELECT set_config('request.jwt.claim.sub', $1, true)",
      expect.stringContaining("WITH selected_memories"),
      "COMMIT"
    ]);
    expect(calls[2]?.values).toEqual(["verified-user-a"]);
    expect(client.release).toHaveBeenCalledOnce();
  });

  it("rejects a caller-supplied user that differs from the authenticated subject", async () => {
    const connect = vi.fn();
    const pool = { connect } as unknown as PostgresPool;
    const memory = createRlsScopedMemoryManagement(pool)("verified-user-a");

    await expect(memory.listConversationalMemories("user-b", { limit: 25 }))
      .rejects.toThrow("Authenticated memory scope mismatch");
    expect(connect).not.toHaveBeenCalled();
  });

  it("rolls back and releases the connection when a scoped query fails", async () => {
    const calls: string[] = [];
    const client: PostgresClient = {
      async query<Row>(sql: string): Promise<PostgresQueryResult<Row>> {
        calls.push(sql);
        if (sql.includes("WITH selected_memories")) throw new Error("query failed");
        return { rows: [] };
      },
      release: vi.fn()
    };
    const pool: PostgresPool = { query: client.query, connect: async () => client };
    const memory = createRlsScopedMemoryManagement(pool)("verified-user-a");

    await expect(memory.listConversationalMemories("verified-user-a", { limit: 25 }))
      .rejects.toThrow("query failed");
    expect(calls.at(-1)).toBe("ROLLBACK");
    expect(client.release).toHaveBeenCalledOnce();
  });
});
