import { describe, expect, it } from "vitest";
import {
  InvalidPlaidConsentError,
  PlaidConsentConflictError,
  PostgresPlaidConsentRepository,
  type PlaidConsentEventRow,
  type PlaidConsentQueryResult,
  type PlaidConsentTransactionClient,
  type PlaidConsentTransactionPool
} from "../../../src/app/plaid/consent-repository.js";

describe("PostgresPlaidConsentRepository", () => {
  it("records explicit profile-read consent as a new immutable, user-scoped event", async () => {
    const pool = new ScriptedPool((sql, values) => sql.startsWith("INSERT")
      ? { rows: [eventRow({
          event_id: String(values[0]), user_id: String(values[1]), event_type: "granted",
          products: values[2] as string[], purpose: "financial_profile", happened_at: String(values[3]),
          previous_event_id: null, granted_at: String(values[3]), revoked_at: null
        })], rowCount: 1 }
      : { rows: [], rowCount: 0 });
    const repository = new PostgresPlaidConsentRepository(pool);

    const consent = await repository.recordGrant({
      eventId: "grant-1", userId: "user-1", products: ["transactions"], grantedAt: "2026-10-07T12:00:00.000Z"
    });

    expect(consent).toMatchObject({
      consentId: "grant-1", userId: "user-1", status: "active", products: ["transactions"],
      purpose: "financial_profile", grantedAt: "2026-10-07T12:00:00.000Z", revokedAt: null
    });
    expect(Object.isFrozen(consent)).toBe(true);
    expect(pool.statements.map(({ sql }) => sql)).toContain("BEGIN");
    expect(pool.statements.find(({ sql }) => sql.includes("pg_advisory_xact_lock"))?.values).toEqual(["user-1"]);
    expect(pool.statements.find(({ sql }) => sql.startsWith("INSERT"))?.values).toEqual([
      "grant-1", "user-1", ["transactions"], "2026-10-07T12:00:00.000Z", null
    ]);
    expect(pool.statements.find(({ sql }) => sql.startsWith("INSERT"))?.sql).toContain("'granted'");
    expect(pool.statements.find(({ sql }) => sql.startsWith("INSERT"))?.sql).toContain("'financial_profile'");
    expect(pool.statements.some(({ sql }) => /^\s*(UPDATE|DELETE)\b/i.test(sql))).toBe(false);
    expect(pool.statements.at(-1)?.sql).toBe("COMMIT");
  });

  it("requires a non-empty supported read scope and valid consent identity/time", async () => {
    const pool = new ScriptedPool(() => ({ rows: [], rowCount: 0 }));
    const repository = new PostgresPlaidConsentRepository(pool);
    const valid = { eventId: "grant-1", userId: "user-1", products: ["transactions"] as const, grantedAt: "2026-10-07T12:00:00.000Z" };

    await expect(repository.recordGrant({ ...valid, products: [] })).rejects.toBeInstanceOf(InvalidPlaidConsentError);
    await expect(repository.recordGrant({ ...valid, products: ["transfer"] as never })).rejects.toBeInstanceOf(InvalidPlaidConsentError);
    await expect(repository.recordGrant({ ...valid, userId: "  " })).rejects.toBeInstanceOf(InvalidPlaidConsentError);
    await expect(repository.recordGrant({ ...valid, grantedAt: "not-a-time" })).rejects.toBeInstanceOf(InvalidPlaidConsentError);
    expect(pool.statements).toHaveLength(0);
  });

  it("returns only the latest consent event for the requested user", async () => {
    const pool = new ScriptedPool((sql, values) => sql.startsWith("SELECT") && values[0] === "user-1"
      ? { rows: [eventRow()], rowCount: 1 }
      : { rows: [], rowCount: 0 });
    const repository = new PostgresPlaidConsentRepository(pool);

    const ownConsent = await repository.getConsent("user-1");
    const otherConsent = await repository.getConsent("user-2");

    expect(ownConsent).toMatchObject({ consentId: "grant-1", userId: "user-1", status: "active" });
    expect(otherConsent).toBeNull();
    expect(pool.statements[0]?.sql).toContain("WHERE user_id = $1");
    expect(pool.statements[0]?.sql).toContain("ORDER BY sequence_id DESC");
    expect(pool.statements[0]?.values).toEqual(["user-1"]);
    expect(pool.statements[1]?.values).toEqual(["user-2"]);
  });

  it("appends a revocation linked to the exact active grant and makes repeated revoke idempotent", async () => {
    let latest: PlaidConsentEventRow | null = eventRow();
    const pool = new ScriptedPool((sql, values) => {
      if (sql.startsWith("SELECT")) return { rows: latest && latest.user_id === values[0] ? [latest] : [], rowCount: latest ? 1 : 0 };
      if (sql.startsWith("INSERT")) {
        latest = eventRow({
          event_id: String(values[0]), user_id: String(values[1]), event_type: "revoked",
          products: values[2] as string[], purpose: "financial_profile", happened_at: String(values[3]),
          previous_event_id: String(values[4]), granted_at: String(values[5]), revoked_at: String(values[3])
        });
        return { rows: [latest], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const repository = new PostgresPlaidConsentRepository(pool);

    const revoked = await repository.revoke({
      eventId: "revoke-1", userId: "user-1", grantEventId: "grant-1", revokedAt: "2026-10-07T13:00:00.000Z"
    });
    const statementsAfterFirstRevoke = pool.statements.length;
    const repeated = await repository.revoke({
      eventId: "revoke-retry", userId: "user-1", grantEventId: "grant-1", revokedAt: "2026-10-07T13:01:00.000Z"
    });

    expect(revoked).toMatchObject({ consentId: "grant-1", status: "revoked", products: ["transactions"] });
    expect(repeated).toEqual(revoked);
    expect(pool.statements.filter(({ sql }) => sql.startsWith("INSERT"))).toHaveLength(1);
    expect(pool.statements.find(({ sql }) => sql.startsWith("INSERT"))?.values).toEqual([
      "revoke-1", "user-1", ["transactions"], "2026-10-07T13:00:00.000Z",
      "grant-1", "2026-10-07T12:00:00.000Z"
    ]);
    expect(pool.statements.length).toBeGreaterThan(statementsAfterFirstRevoke);
  });

  it("does not let a stale grant id revoke a newer connection", async () => {
    const pool = new ScriptedPool((sql) => sql.startsWith("SELECT")
      ? { rows: [eventRow({ event_id: "grant-new" })], rowCount: 1 }
      : { rows: [], rowCount: 0 });
    const repository = new PostgresPlaidConsentRepository(pool);

    await expect(repository.revoke({
      eventId: "revoke-old", userId: "user-1", grantEventId: "grant-1", revokedAt: "2026-10-07T13:00:00.000Z"
    })).rejects.toBeInstanceOf(PlaidConsentConflictError);
    expect(pool.statements.some(({ sql }) => sql.startsWith("INSERT"))).toBe(false);
    expect(pool.statements.at(-1)?.sql).toBe("ROLLBACK");
  });

  it("treats a re-grant after revocation as a new active scope linked to prior history", async () => {
    let latest = eventRow({
      sequence_id: 2,
      event_id: "revoke-1",
      event_type: "revoked",
      previous_event_id: "grant-1",
      happened_at: "2026-10-07T13:00:00.000Z",
      revoked_at: "2026-10-07T13:00:00.000Z"
    });
    const pool = new ScriptedPool((sql, values) => {
      if (sql.startsWith("SELECT")) return { rows: [latest], rowCount: 1 };
      if (sql.startsWith("INSERT")) {
        latest = eventRow({
          sequence_id: 3,
          event_id: String(values[0]),
          user_id: String(values[1]),
          event_type: "granted",
          products: values[2] as string[],
          happened_at: String(values[3]),
          previous_event_id: String(values[4]),
          granted_at: String(values[3]),
          revoked_at: null
        });
        return { rows: [latest], rowCount: 1 };
      }
      return { rows: [], rowCount: 0 };
    });
    const repository = new PostgresPlaidConsentRepository(pool);

    const refreshed = await repository.recordGrant({
      eventId: "grant-2", userId: "user-1", products: ["transactions"], grantedAt: "2026-10-07T14:00:00.000Z"
    });

    expect(refreshed).toMatchObject({ consentId: "grant-2", status: "active", products: ["transactions"] });
    expect(pool.statements.find(({ sql }) => sql.startsWith("INSERT"))?.values.at(-1)).toBe("revoke-1");
  });
});

function eventRow(overrides: Partial<PlaidConsentEventRow> = {}): PlaidConsentEventRow {
  return {
    sequence_id: 1,
    event_id: "grant-1",
    user_id: "user-1",
    event_type: "granted",
    products: ["transactions"],
    purpose: "financial_profile",
    happened_at: "2026-10-07T12:00:00.000Z",
    previous_event_id: null,
    granted_at: "2026-10-07T12:00:00.000Z",
    revoked_at: null,
    ...overrides
  };
}

class ScriptedPool implements PlaidConsentTransactionPool {
  readonly statements: Array<{ sql: string; values: readonly unknown[] }> = [];
  readonly client: PlaidConsentTransactionClient = {
    query: async <T>(sql: string, values: readonly unknown[] = []) => this.run<T>(sql, values),
    release: () => undefined
  };

  constructor(private readonly runQuery: (sql: string, values: readonly unknown[]) => PlaidConsentQueryResult<unknown>) {}

  async connect(): Promise<PlaidConsentTransactionClient> { return this.client; }
  async query<T>(sql: string, values: readonly unknown[] = []): Promise<PlaidConsentQueryResult<T>> {
    return this.run<T>(sql, values);
  }
  private async run<T>(sql: string, values: readonly unknown[]): Promise<PlaidConsentQueryResult<T>> {
    this.statements.push({ sql, values });
    return this.runQuery(sql, values) as PlaidConsentQueryResult<T>;
  }
}
