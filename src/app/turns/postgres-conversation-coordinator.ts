import type { ConversationCoordinator } from "./conversation-coordinator.js";
import type { PostgresClient, PostgresPool } from "../shared/postgres-types.js";

const MAX_LOCK_WAIT_MS = 30_000;

/** Uses a session advisory lock so separate local app processes serialize each conversation. */
export class PostgresConversationCoordinator implements ConversationCoordinator {
  constructor(private readonly pool: PostgresPool, private readonly maxLockWaitMs = MAX_LOCK_WAIT_MS) {
    if (!Number.isSafeInteger(maxLockWaitMs) || maxLockWaitMs < 1) {
      throw new Error("Conversation lock wait must be a positive integer number of milliseconds.");
    }
  }

  async runExclusive<T>(userId: string, conversationId: string, operation: () => Promise<T>): Promise<T> {
    if (!userId.trim() || !conversationId.trim()) throw new Error("Conversation lock identity is required.");
    let client: PostgresClient | undefined;
    const lockDeadline = Date.now() + this.maxLockWaitMs;
    let retryDelay = 25;
    try {
      while (!client) {
        const candidate = await this.pool.connect();
        try {
          const result = await candidate.query<{ acquired: boolean }>(
            "SELECT pg_try_advisory_lock(hashtext($1), hashtext($2)) AS acquired",
            [userId, conversationId]
          );
          if (result.rows[0]?.acquired) client = candidate;
          else candidate.release();
        } catch (error) {
          candidate.release(error instanceof Error ? error : true);
          throw error;
        }
        if (!client) {
          if (Date.now() >= lockDeadline) throw new Error("Timed out waiting for the conversation lock.");
          await delay(Math.min(retryDelay, Math.max(1, lockDeadline - Date.now())));
          retryDelay = Math.min(500, retryDelay * 2);
        }
      }
    } catch (error) {
      throw error;
    }

    let value!: T;
    let operationError: unknown;
    try { value = await operation(); } catch (error) { operationError = error; }
    try {
      const unlocked = await client.query<{ released: boolean }>(
        "SELECT pg_advisory_unlock(hashtext($1), hashtext($2)) AS released",
        [userId, conversationId]
      );
      if (!unlocked.rows[0]?.released) throw new Error("The conversation lock was not held during release.");
    } catch (error) {
      client.release(error instanceof Error ? error : true);
      if (operationError !== undefined) throw operationError;
      throw error;
    }
    client.release();
    if (operationError !== undefined) throw operationError;
    return value;
  }
}

function delay(milliseconds: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
