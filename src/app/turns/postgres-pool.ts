import { Pool } from "pg";
import { PostgresTurnRepository } from "./postgres-turn-repository.js";

/**
 * Creates the shared PostgreSQL pool used by a server process. Call pool.end() at shutdown.
 * `maxPoolSize` may be set from 1 through 20 (default 5); serverless runtimes should use a small value.
 */
export function createPostgresTurnStore(databaseUrl: string, options: { maxPoolSize?: number } = {}): {
  pool: Pool;
  turns: PostgresTurnRepository;
} {
  const maxPoolSize = options.maxPoolSize ?? 5;
  if (!Number.isSafeInteger(maxPoolSize) || maxPoolSize < 1 || maxPoolSize > 20) {
    throw new Error("PostgreSQL pool size must be an integer from 1 to 20.");
  }
  const sslSetting = process.env.DB_SSL ?? "false";
  if (sslSetting !== "true" && sslSetting !== "false") {
    throw new Error("DB_SSL must be true or false.");
  }
  const pool = new Pool({
    connectionString: databaseUrl,
    ...(sslSetting === "true" ? { ssl: { rejectUnauthorized: true } } : {}),
    max: maxPoolSize,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000
  });
  return { pool, turns: new PostgresTurnRepository(pool) };
}
