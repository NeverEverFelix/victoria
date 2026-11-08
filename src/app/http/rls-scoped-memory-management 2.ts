import type { PostgresClient, PostgresPool, PostgresQueryable, PostgresQueryResult } from "../shared/postgres-types.js";
import { MemoryOrchestrator } from "../../agent/memory/memory-orchestrator.js";
import { PostgresMemoryRepository } from "../../agent/memory/postgres-memory-repository.js";
import type { SemanticEmbeddingProvider } from "../../agent/memory/semantic-embedding.js";

/** Binds each repository statement to a verified subject using transaction-local RLS context. */
export function createRlsScopedMemoryManagement(pool: PostgresPool, embeddings?: SemanticEmbeddingProvider) {
  return (authenticatedUserId: string) => {
    const userId = authenticatedUserId.trim();
    if (!userId) throw new Error("Authenticated memory scope is required.");
    const db: PostgresQueryable = {
      query: <Row = Record<string, unknown>>(sql: string, values?: readonly unknown[]) => {
        if (/\buser_id\s*=\s*\$1\b/i.test(sql) && values?.[0] !== userId) {
          return Promise.reject(new Error("Authenticated memory scope mismatch."));
        }
        return queryAsUser<Row>(pool, userId, sql, values);
      }
    };
    const repository = new PostgresMemoryRepository(db, undefined, embeddings);
    return new MemoryOrchestrator(repository, { financialProfiles: repository });
  };
}

async function queryAsUser<Row>(pool: PostgresPool, userId: string, sql: string, values?: readonly unknown[]): Promise<PostgresQueryResult<Row>> {
  const client: PostgresClient = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SET LOCAL ROLE victoria_memory_api");
    await client.query("SELECT set_config('request.jwt.claim.sub', $1, true)", [userId]);
    const result = await client.query<Row>(sql, values);
    await client.query("COMMIT");
    return result;
  } catch (error) {
    try { await client.query("ROLLBACK"); } catch { /* preserve the original failure */ }
    throw error;
  } finally {
    client.release();
  }
}
