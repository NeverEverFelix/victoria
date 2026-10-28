import { describe, expect, it } from "vitest";
import { createQueuedTurn } from "../../../src/domain/turns/lifecycle.js";
import {
  PostgresTurnRepository,
  type PostgresClient,
  type PostgresPool,
  type PostgresQueryResult
} from "../../../src/app/turns/postgres-turn-repository.js";

type Row = Record<string, unknown>;

function row(overrides: Partial<Row> = {}): Row {
  return {
    id: "turn-1", user_id: "user-1", conversation_id: "conversation-1", idempotency_key: "request-1",
    user_message: "I skipped a purchase.", request_fingerprint: "fingerprint-1", status: "queued",
    attempt: 0, revision: 0, accepted_at: "2026-10-05T12:00:00.000Z", updated_at: "2026-10-05T12:00:00.000Z",
    result_id: null, result_payload: null, failure_code: null, ...overrides
  };
}

function turn(id = "turn-1") {
  return createQueuedTurn({
    id, userId: "user-1", conversationId: "conversation-1", idempotencyKey: "request-1",
    userMessage: "I skipped a purchase.", requestFingerprint: "fingerprint-1", acceptedAt: "2026-10-05T12:00:00.000Z"
  });
}

class ScriptedPool implements PostgresPool {
  readonly statements: Array<{ sql: string; values: readonly unknown[] }> = [];
  readonly client: PostgresClient = {
    query: async <T>(sql: string, values: readonly unknown[] = []) => this.run<T>(sql, values),
    release: () => undefined
  };

  constructor(private readonly runQuery: (sql: string, values: readonly unknown[]) => PostgresQueryResult<unknown>) {}

  async connect(): Promise<PostgresClient> { return this.client; }
  async query<T>(sql: string, values: readonly unknown[] = []): Promise<PostgresQueryResult<T>> {
    return this.run<T>(sql, values);
  }
  private async run<T>(sql: string, values: readonly unknown[]): Promise<PostgresQueryResult<T>> {
    this.statements.push({ sql, values });
    return this.runQuery(sql, values) as PostgresQueryResult<T>;
  }
}

describe("PostgresTurnRepository", () => {
  it("inserts queued turns transactionally and relies on a unique user/idempotency constraint", async () => {
    const pool = new ScriptedPool((sql) => sql.startsWith("INSERT")
      ? { rows: [row()], rowCount: 1 }
      : { rows: [], rowCount: 0 });
    const repository = new PostgresTurnRepository(pool);

    const accepted = await repository.accept(turn());

    expect(accepted.disposition).toBe("created");
    expect(accepted.turn).toMatchObject({ id: "turn-1", status: "queued", revision: 0 });
    expect(pool.statements[0]?.sql).toBe("BEGIN");
    expect(pool.statements[1]?.sql).toContain("ON CONFLICT (user_id, idempotency_key) DO NOTHING");
    expect(pool.statements.at(-1)?.sql).toBe("COMMIT");
  });

  it("replays an identical request and conflicts if its key names different content", async () => {
    const pool = new ScriptedPool((sql) => sql.startsWith("INSERT")
      ? { rows: [], rowCount: 0 }
      : sql.startsWith("SELECT") ? { rows: [row()], rowCount: 1 } : { rows: [], rowCount: 0 });
    const repository = new PostgresTurnRepository(pool);

    expect((await repository.accept(turn("generated-retry-id"))).disposition).toBe("replayed");
    await expect(repository.accept(createQueuedTurn({
      id: "turn-3", userId: "user-1", conversationId: "conversation-1", idempotencyKey: "request-1",
      userMessage: "Different message.", requestFingerprint: "different", acceptedAt: "2026-10-05T12:00:00.000Z"
    }))).rejects.toThrow("idempotency key was already used");
    expect(pool.statements.filter((statement) => statement.sql === "ROLLBACK")).toHaveLength(1);
  });

  it("scopes reads and locks the row before compare-and-transition", async () => {
    const pool = new ScriptedPool((sql) => {
      if (sql.startsWith("SELECT")) return { rows: [row()], rowCount: 1 };
      if (sql.startsWith("UPDATE")) return { rows: [{ id: "turn-1" }] };
      return { rows: [], rowCount: 0 };
    });
    const repository = new PostgresTurnRepository(pool);

    const found = await repository.get("user-1", "conversation-1", "turn-1");
    const updated = await repository.compareAndTransition({
      userId: "user-1", conversationId: "conversation-1", turnId: "turn-1", expectedRevision: 0,
      transition: { type: "start", at: "2026-10-05T12:00:01.000Z" }
    });

    expect(found?.id).toBe("turn-1");
    expect(pool.statements[0]?.values).toEqual(["turn-1", "user-1", "conversation-1"]);
    expect(pool.statements.find((statement) => statement.sql.includes("FOR UPDATE"))?.sql).toContain("FOR UPDATE");
    expect(updated).toMatchObject({ status: "running", attempt: 1, revision: 1 });
  });

  it("writes completed result payload in the same lifecycle transaction", async () => {
    const pool = new ScriptedPool((sql) => {
      if (sql.startsWith("SELECT")) return { rows: [row({ status: "running", attempt: 1, revision: 1 })], rowCount: 1 };
      if (sql.startsWith("UPDATE")) return { rows: [{ id: "turn-1" }], rowCount: 1 };
      return { rows: [], rowCount: 0 };
    });
    const repository = new PostgresTurnRepository(pool);
    const payload = { message: "Saved response", decision: { action: "reflect" } };

    const completed = await repository.compareAndTransition({
      userId: "user-1", conversationId: "conversation-1", turnId: "turn-1", expectedRevision: 1,
      transition: { type: "complete", at: "2026-10-05T12:00:02.000Z", resultId: "turn-1", resultPayload: payload }
    });

    expect(completed).toMatchObject({ status: "completed", resultPayload: payload });
    const update = pool.statements.find((statement) => statement.sql.includes("UPDATE victoria_turns"));
    expect(update?.sql).toContain("result_payload = $7::jsonb");
    expect(update?.values[6]).toBe(JSON.stringify(payload));
  });
});
