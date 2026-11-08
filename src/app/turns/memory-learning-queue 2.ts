import type { PostgresPool } from "../shared/postgres-types.js";

export interface MemoryLearningJob {
  readonly turnId: string;
  readonly userId: string;
  readonly conversationId: string;
  readonly leaseToken: string;
  readonly attempts: number;
}

export interface MemoryLearningQueue {
  enqueue(input: { readonly userId: string; readonly conversationId: string; readonly turnId: string }): Promise<boolean>;
  claim(input: { readonly leaseToken: string; readonly leaseSeconds?: number }): Promise<MemoryLearningJob | null>;
  complete(job: MemoryLearningJob): Promise<boolean>;
  fail(job: MemoryLearningJob, failureCode: string, maxAttempts?: number): Promise<boolean>;
}

/** Durable queue with identity-only payloads; the original message stays in victoria_turns. */
export class PostgresMemoryLearningQueue implements MemoryLearningQueue {
  constructor(private readonly pool: PostgresPool) {}

  async enqueue(input: { readonly userId: string; readonly conversationId: string; readonly turnId: string }): Promise<boolean> {
    const result = await this.pool.query<{ turn_id: string }>(
      `INSERT INTO victoria_memory_learning_jobs (turn_id, user_id, conversation_id)
       SELECT id, user_id, conversation_id FROM victoria_turns
       WHERE id = $1 AND user_id = $2 AND conversation_id = $3 AND status IN ('running', 'completed')
       ON CONFLICT (turn_id) DO NOTHING RETURNING turn_id`,
      [input.turnId, input.userId, input.conversationId]
    );
    return result.rows.length === 1;
  }

  async claim(input: { readonly leaseToken: string; readonly leaseSeconds?: number }): Promise<MemoryLearningJob | null> {
    const leaseSeconds = input.leaseSeconds ?? 60;
    if (!input.leaseToken.trim() || !Number.isSafeInteger(leaseSeconds) || leaseSeconds < 1 || leaseSeconds > 900) {
      throw new Error("Memory learning claim requires a token and a lease from 1 to 900 seconds.");
    }
    const result = await this.pool.query<{
      turn_id: string; user_id: string; conversation_id: string; attempts: number;
    }>(
      `WITH candidate AS (
         SELECT job.turn_id FROM victoria_memory_learning_jobs AS job
         JOIN victoria_turns AS turn
           ON turn.id = job.turn_id AND turn.user_id = job.user_id AND turn.conversation_id = job.conversation_id
         WHERE turn.status = 'completed' AND job.attempts < 5 AND job.available_at <= now()
           AND (job.status = 'queued' OR (job.status = 'processing' AND job.lease_expires_at <= now()))
         ORDER BY job.available_at, job.created_at, job.turn_id
         FOR UPDATE OF job SKIP LOCKED LIMIT 1
       )
       UPDATE victoria_memory_learning_jobs AS job
       SET status = 'processing', attempts = job.attempts + 1,
           lease_expires_at = now() + ($1::integer * interval '1 second'), lease_token = $2,
           failure_code = NULL, updated_at = now()
       FROM candidate
       WHERE job.turn_id = candidate.turn_id
       RETURNING job.turn_id, job.user_id, job.conversation_id, job.attempts`,
      [leaseSeconds, input.leaseToken]
    );
    const row = result.rows[0];
    return row ? Object.freeze({
      turnId: row.turn_id, userId: row.user_id, conversationId: row.conversation_id,
      attempts: row.attempts, leaseToken: input.leaseToken
    }) : null;
  }

  async complete(job: MemoryLearningJob): Promise<boolean> {
    const result = await this.pool.query(
      `UPDATE victoria_memory_learning_jobs
       SET status = 'completed', lease_expires_at = NULL, lease_token = NULL, failure_code = NULL, updated_at = now()
       WHERE turn_id = $1 AND user_id = $2 AND conversation_id = $3
         AND status = 'processing' AND lease_token = $4`,
      [job.turnId, job.userId, job.conversationId, job.leaseToken]
    );
    return result.rowCount === 1;
  }

  async fail(job: MemoryLearningJob, failureCode: string, maxAttempts = 5): Promise<boolean> {
    if (!/^[a-z0-9_]{1,64}$/.test(failureCode) || !Number.isSafeInteger(maxAttempts) || maxAttempts < 1 || maxAttempts > 10) {
      throw new Error("Memory learning failure metadata is invalid.");
    }
    const result = await this.pool.query(
      `UPDATE victoria_memory_learning_jobs
       SET status = CASE WHEN attempts >= $5 THEN 'failed' ELSE 'queued' END,
           available_at = now() + (LEAST(300, (2 ^ LEAST(attempts, 8))::integer) * interval '1 second'),
           lease_expires_at = NULL, lease_token = NULL, failure_code = $6, updated_at = now()
       WHERE turn_id = $1 AND user_id = $2 AND conversation_id = $3
         AND status = 'processing' AND lease_token = $4`,
      [job.turnId, job.userId, job.conversationId, job.leaseToken, maxAttempts, failureCode]
    );
    return result.rowCount === 1;
  }
}
