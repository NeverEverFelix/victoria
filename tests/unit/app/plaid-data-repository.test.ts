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
    const db = new ScriptedPool((sql) => sql.includes("INSERT INTO victoria_plaid_revocation_queue")
      ? { rows: [{ attempts: 0 }], rowCount: 1 }
      : sql.includes("FROM victoria_plaid_items") && sql.includes("FOR UPDATE")
      ? { rows: [{ item_id: "item-a", access_token_ciphertext: "cipher-a", access_token_iv: "iv-a",
        access_token_auth_tag: "tag-a", encryption_key_version: "v1" }], rowCount: 1 }
      : { rows: [], rowCount: 1 });
    const repository = new PostgresPlaidDataRepository(db);

    const queued = await repository.beginDisconnect("user-a", "item-a");

    expect(queued).toMatchObject([{ userId: "user-a", itemId: "item-a", token: { ciphertext: "cipher-a", keyVersion: "v1" }, attempts: 0 }]);
    expect(db.statements.find(({ sql }) => sql.includes("INSERT INTO victoria_plaid_revocation_queue"))?.sql)
      .toContain("claimed_until)");
    expect(db.statements.find(({ sql }) => sql.includes("INSERT INTO victoria_plaid_revocation_queue"))?.sql)
      .toContain("RETURNING attempts");
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

  it("LIFE-004 scopes revocation completion and retry updates to the user and Item", async () => {
    const db = new ScriptedPool(() => ({ rows: [], rowCount: 1 }));
    const repository = new PostgresPlaidDataRepository(db);

    await repository.completeRevocation("user-a", "item-a");
    await repository.failRevocation("user-a", "item-a", "2026-10-15T12:01:00.000Z");

    expect(db.statements[0]?.sql).toContain("WHERE user_id=$1 AND item_id=$2");
    expect(db.statements[0]?.values).toEqual(["user-a", "item-a"]);
    expect(db.statements[1]?.sql).toContain("WHERE user_id=$1 AND item_id=$2");
    expect(db.statements[1]?.values).toEqual(["user-a", "item-a", "2026-10-15T12:01:00.000Z", "pending", null]);
    await expect(repository.countPendingRevocations(" ")).rejects.toThrow("A user and optional Item ID are required.");
  });

  it("LIFE-004 retains permanent revocation failures for manual review", async () => {
    const db = new ScriptedPool(() => ({ rows: [], rowCount: 1 }));
    const repository = new PostgresPlaidDataRepository(db);

    await repository.failRevocation("user-a", "item-a", null, true);

    expect(db.statements[0]?.sql).toContain("status=$4");
    expect(db.statements[0]?.sql).toContain("claimed_until=NULL");
    expect(db.statements[0]?.values).toEqual(["user-a", "item-a", null, "manual_review", null]);
  });

  it("LIFE-004 claims due revocations atomically so concurrent workers skip held rows", async () => {
    const db = new ScriptedPool(() => ({ rows: [], rowCount: 0 }));
    const repository = new PostgresPlaidDataRepository(db);

    await repository.listDueRevocations(12, "user-a", "item-a");

    expect(db.statements[0]?.sql).toContain("FOR UPDATE SKIP LOCKED");
    expect(db.statements[0]?.sql).toContain("claimed_until = now() + interval '30 minutes'");
    expect(db.statements[0]?.sql).toContain("status = 'pending'");
    expect(db.statements[0]?.sql).toContain("user_id=$2");
    expect(db.statements[0]?.sql).toContain("item_id=$3");
    expect(db.statements[0]?.values).toEqual([12, "user-a", "item-a"]);
  });

  it("LIFE-005 scopes token rotation and read-back verification to the user and Item", async () => {
    const envelope = { ciphertext: "next-cipher", iv: "next-iv", authTag: "next-tag", keyVersion: "v2" };
    const db = new ScriptedPool((sql) => sql.includes("SELECT access_token_ciphertext")
      ? { rows: [{ access_token_ciphertext: envelope.ciphertext, access_token_iv: envelope.iv,
        access_token_auth_tag: envelope.authTag, encryption_key_version: envelope.keyVersion }], rowCount: 1 }
      : sql.startsWith("UPDATE victoria_plaid_revocation_queue") ? { rows: [], rowCount: 0 } : { rows: [], rowCount: 1 });
    const repository = new PostgresPlaidDataRepository(db);

    await expect(repository.replaceToken("user-a", "item-a", envelope)).resolves.toEqual(envelope);

    expect(db.statements.map(({ sql }) => sql)).toEqual([
      "BEGIN",
      expect.stringContaining("UPDATE victoria_plaid_items"),
      expect.stringContaining("UPDATE victoria_plaid_revocation_queue"),
      expect.stringContaining("UNION ALL"),
      "COMMIT"
    ]);
    expect(db.statements[1]?.values).toEqual(["user-a", "item-a", "next-cipher", "next-iv", "next-tag", "v2"]);
    expect(db.statements[3]?.values).toEqual(["user-a", "item-a"]);
  });

  it("LIFE-005 rolls back token rotation when persistence verification fails", async () => {
    const db = new ScriptedPool((sql) => sql.includes("SELECT access_token_ciphertext")
      ? { rows: [], rowCount: 0 }
      : sql.startsWith("UPDATE victoria_plaid_revocation_queue") ? { rows: [], rowCount: 0 } : { rows: [], rowCount: 1 });
    const repository = new PostgresPlaidDataRepository(db);

    await expect(repository.replaceToken("user-a", "item-a", {
      ciphertext: "cipher", iv: "iv", authTag: "tag", keyVersion: "v2"
    })).rejects.toThrow("Plaid token rotation verification failed.");
    expect(db.statements.at(-1)?.sql).toBe("ROLLBACK");
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
