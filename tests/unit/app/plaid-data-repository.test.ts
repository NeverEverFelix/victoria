import { describe, expect, it } from "vitest";
import { PostgresPlaidDataRepository } from "../../../src/app/plaid/plaid-data-repository.js";
import type { PostgresClient, PostgresPool, PostgresQueryResult } from "../../../src/app/turns/postgres-turn-repository.js";

type Statement = { sql: string; values: readonly unknown[] };

describe("PostgresPlaidDataRepository lifecycle", () => {
  it("LIFE-001 sets a UTC expiry exactly 90 days after the source date and filters expired reads", async () => {
    const db = new ScriptedPool((sql) => sql.includes("SELECT item_id FROM victoria_plaid_items")
      ? { rows: [{ item_id: "item-a" }], rowCount: 1 }
      : { rows: [], rowCount: 0 });
    const repository = new PostgresPlaidDataRepository(db);
    await repository.applySyncPage("user-a", "item-a", {
      added: [{ transactionId: "tx-1", amountCents: 100, currencyCode: "USD", date: "2026-01-31",
        merchantName: "Cafe", category: null, detailedCategory: null, merchantEntityId: null, paymentChannel: null, pending: false }],
      modified: [], removed: [], nextCursor: "cursor-1", hasMore: false
    });
    const insert = db.statements.find(({ sql }) => sql.includes("INSERT INTO victoria_plaid_transactions"));
    expect(insert?.sql).toContain("(($6::date + 90)::timestamp AT TIME ZONE 'UTC')");
    expect(insert?.values[5]).toBe("2026-01-31");

    await repository.listTransactions("user-a", "2025-10-15");
    const read = db.statements.at(-1);
    expect(read?.sql).toContain("expires_at > now()"); // equality is expired and excluded
    expect(read?.sql).toContain("WHERE user_id = $1");
    expect(read?.values).toEqual(["user-a", "2025-10-15"]);
  });

  it("LIFE-002 and LIFE-003 queues only the authenticated user's encrypted tokens and purges all local profile data", async () => {
    const db = new ScriptedPool((sql) => sql.includes("FROM victoria_plaid_items") && sql.includes("FOR UPDATE")
      ? { rows: [{ item_id: "item-a", access_token_ciphertext: "cipher-a", access_token_iv: "iv-a",
        access_token_auth_tag: "tag-a", encryption_key_version: "v1" }], rowCount: 1 }
      : { rows: [], rowCount: 1 });
    const repository = new PostgresPlaidDataRepository(db);

    const queued = await repository.beginDisconnect("user-a", "item-a");

    expect(queued).toMatchObject([{ userId: "user-a", itemId: "item-a", token: { ciphertext: "cipher-a", keyVersion: "v1" } }]);
    expect(db.statements.find(({ sql }) => sql.includes("INSERT INTO victoria_plaid_revocation_queue"))?.values)
      .toEqual(["user-a", "item-a", "cipher-a", "iv-a", "tag-a", "v1"]);
    expect(db.statements.find(({ sql }) => sql.startsWith("DELETE FROM victoria_plaid_transactions"))?.values)
      .toEqual(["user-a", "item-a"]);
    expect(db.statements.find(({ sql }) => sql.startsWith("DELETE FROM victoria_plaid_items"))?.values)
      .toEqual(["user-a", "item-a"]);
    expect(db.statements.find(({ sql }) => sql.includes("victoria_purge_plaid_profile_memories"))?.values)
      .toEqual(["user-a"]);
    expect(db.statements.at(-1)?.sql).toBe("COMMIT");
  });

  it("LIFE-002 refuses a foreign or missing Item without deleting any user data", async () => {
    const db = new ScriptedPool(() => ({ rows: [], rowCount: 0 }));
    const repository = new PostgresPlaidDataRepository(db);

    await expect(repository.beginDisconnect("user-a", "item-owned-by-user-b"))
      .rejects.toThrow("Plaid Item was not found for this user.");
    expect(db.statements.some(({ sql }) => sql.startsWith("DELETE FROM"))).toBe(false);
    expect(db.statements.some(({ sql }) => sql.includes("victoria_purge_plaid_profile_memories"))).toBe(false);
    expect(db.statements.at(-1)?.sql).toBe("ROLLBACK");
    expect(db.statements.find(({ sql }) => sql.includes("FOR UPDATE"))?.values)
      .toEqual(["user-a", "item-owned-by-user-b"]);
  });

  it("LIFE-002 lists Items only for the requested user and excludes disconnected Items", async () => {
    const db = new ScriptedPool((sql, values) => sql.includes("FROM victoria_plaid_items")
      ? { rows: values[0] === "user-a" ? [{ user_id: "user-a", item_id: "item-a", access_token_ciphertext: "cipher",
        access_token_iv: "iv", access_token_auth_tag: "tag", encryption_key_version: "v2", sync_cursor: null }] : [], rowCount: 0 }
      : { rows: [], rowCount: 0 });
    const repository = new PostgresPlaidDataRepository(db);

    await expect(repository.listItems("user-a")).resolves.toHaveLength(1);
    await expect(repository.listItems("user-b")).resolves.toHaveLength(0);
    expect(db.statements[0]?.sql).toContain("disconnect_requested_at IS NULL");
    expect(db.statements[0]?.values).toEqual(["user-a"]);
    expect(db.statements[1]?.values).toEqual(["user-b"]);
  });
});

class ScriptedPool implements PostgresPool {
  readonly statements: Statement[] = [];
  private readonly client: PostgresClient = {
    query: async <Row>(sql: string, values: readonly unknown[] = []) => this.run<Row>(sql, values),
    release: () => undefined
  };

  constructor(private readonly respond: (sql: string, values: readonly unknown[]) => PostgresQueryResult<unknown>) {}
  query<Row>(sql: string, values: readonly unknown[] = []): Promise<PostgresQueryResult<Row>> { return this.run(sql, values); }
  async connect(): Promise<PostgresClient> { return this.client; }
  private async run<Row>(sql: string, values: readonly unknown[] = []): Promise<PostgresQueryResult<Row>> {
    this.statements.push({ sql, values });
    return this.respond(sql, values) as PostgresQueryResult<Row>;
  }
}
