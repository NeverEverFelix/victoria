import { transitionTurn, type TurnRecord, type TurnTransition } from "../../domain/turns/lifecycle.js";
import {
  TurnNotFoundError,
  TurnRepositoryConflictError,
  TurnRevisionConflictError,
  type AcceptTurnResult,
  type TurnRepository
} from "./turn-repository.js";
import type { PostgresClient, PostgresPool } from "../shared/postgres-types.js";

export type { PostgresClient, PostgresPool, PostgresQueryable, PostgresQueryResult } from "../shared/postgres-types.js";

interface TurnRow {
  id: string;
  user_id: string;
  conversation_id: string;
  idempotency_key: string;
  user_message: string;
  request_fingerprint: string;
  status: TurnRecord["status"];
  attempt: number;
  revision: number;
  accepted_at: string | Date;
  updated_at: string | Date;
  result_id: string | null;
  failure_code: string | null;
}

/** PostgreSQL-backed turn storage. The supplied pool owns connections and shutdown. */
export class PostgresTurnRepository implements TurnRepository {
  constructor(private readonly pool: PostgresPool) {}

  async accept(turn: TurnRecord): Promise<AcceptTurnResult> {
    assertInitialTurn(turn);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const inserted = await client.query<TurnRow>(
        `INSERT INTO victoria_turns
          (id, user_id, conversation_id, idempotency_key, user_message, request_fingerprint,
           status, attempt, revision, accepted_at, updated_at, result_id, failure_code)
         VALUES ($1, $2, $3, $4, $5, $6, 'queued', 0, 0, $7, $7, NULL, NULL)
         ON CONFLICT (user_id, idempotency_key) DO NOTHING
         RETURNING *`,
        [turn.id, turn.userId, turn.conversationId, turn.idempotencyKey, turn.userMessage,
          turn.requestFingerprint, turn.acceptedAt]
      );
      if (inserted.rows[0]) {
        await client.query("COMMIT");
        return Object.freeze({ turn: fromRow(inserted.rows[0]), disposition: "created" });
      }

      const existing = await client.query<TurnRow>(
        `SELECT * FROM victoria_turns WHERE user_id = $1 AND idempotency_key = $2 FOR UPDATE`,
        [turn.userId, turn.idempotencyKey]
      );
      const row = existing.rows[0];
      if (!row) throw new Error("Idempotency conflict row disappeared during transaction.");
      const stored = fromRow(row);
      if (stored.conversationId !== turn.conversationId || stored.requestFingerprint !== turn.requestFingerprint) {
        throw new TurnRepositoryConflictError("The idempotency key was already used for a different request.");
      }
      await client.query("COMMIT");
      return Object.freeze({ turn: stored, disposition: "replayed" });
    } catch (error) {
      await rollback(client);
      if (isUniqueViolation(error)) {
        throw new TurnRepositoryConflictError("The turn identifier is already in use.");
      }
      throw error;
    } finally {
      client.release();
    }
  }

  async get(userId: string, conversationId: string, turnId: string): Promise<TurnRecord | null> {
    const result = await this.pool.query<TurnRow>(
      `SELECT * FROM victoria_turns WHERE id = $1 AND user_id = $2 AND conversation_id = $3`,
      [turnId, userId, conversationId]
    );
    return result.rows[0] ? fromRow(result.rows[0]) : null;
  }

  async compareAndTransition(input: {
    userId: string;
    conversationId: string;
    turnId: string;
    expectedRevision: number;
    transition: TurnTransition;
  }): Promise<TurnRecord> {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const selected = await client.query<TurnRow>(
        `SELECT * FROM victoria_turns WHERE id = $1 AND user_id = $2 AND conversation_id = $3 FOR UPDATE`,
        [input.turnId, input.userId, input.conversationId]
      );
      const row = selected.rows[0];
      if (!row) throw new TurnNotFoundError();
      const current = fromRow(row);
      if (current.revision !== input.expectedRevision) {
        throw new TurnRevisionConflictError(input.expectedRevision, current.revision);
      }
      const updated = transitionTurn(current, input.transition);
      const result = await client.query<{ id: string }>(
        `UPDATE victoria_turns
         SET status = $1, attempt = $2, revision = $3, updated_at = $4, result_id = $5, failure_code = $6
         WHERE id = $7 AND user_id = $8 AND conversation_id = $9 AND revision = $10
         RETURNING id`,
        [updated.status, updated.attempt, updated.revision, updated.updatedAt, updated.resultId ?? null,
          updated.failureCode ?? null, input.turnId, input.userId, input.conversationId, input.expectedRevision]
      );
      if (result.rows.length !== 1) {
        throw new TurnRevisionConflictError(input.expectedRevision, input.expectedRevision + 1);
      }
      await client.query("COMMIT");
      return updated;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

function fromRow(row: TurnRow): TurnRecord {
  const turn: TurnRecord = {
    id: row.id,
    userId: row.user_id,
    conversationId: row.conversation_id,
    idempotencyKey: row.idempotency_key,
    userMessage: row.user_message,
    requestFingerprint: row.request_fingerprint,
    status: row.status,
    attempt: row.attempt,
    revision: row.revision,
    acceptedAt: toIso(row.accepted_at),
    updatedAt: toIso(row.updated_at),
    ...(row.result_id === null ? {} : { resultId: row.result_id }),
    ...(row.failure_code === null ? {} : { failureCode: row.failure_code })
  };
  return Object.freeze(turn);
}

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new Error("Database returned an invalid turn timestamp.");
  return date.toISOString();
}

function assertInitialTurn(turn: TurnRecord): void {
  if (turn.status !== "queued" || turn.attempt !== 0 || turn.revision !== 0 ||
      "resultId" in turn || "failureCode" in turn ||
      !turn.id.trim() || !turn.userId.trim() || !turn.conversationId.trim() ||
      !turn.idempotencyKey.trim() || !turn.userMessage.trim() || !turn.requestFingerprint.trim()) {
    throw new TurnRepositoryConflictError("Only a valid, newly queued turn can be accepted.");
  }
}

async function rollback(client: PostgresClient): Promise<void> {
  try { await client.query("ROLLBACK"); } catch { /* retain the original failure */ }
}

function isUniqueViolation(error: unknown): boolean {
  return typeof error === "object" && error !== null && "code" in error &&
    (error as { code?: unknown }).code === "23505";
}
