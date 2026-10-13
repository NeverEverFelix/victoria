import { Pool } from "pg";
import { PostgresTurnRepository } from "./postgres-turn-repository.js";

/** Creates the shared PostgreSQL pool used by a server process. Call pool.end() at shutdown. */
export function createPostgresTurnStore(databaseUrl: string): {
  pool: Pool;
  turns: PostgresTurnRepository;
} {
  const sslSetting = process.env.DB_SSL ?? "false";
  if (sslSetting !== "true" && sslSetting !== "false") {
    throw new Error("DB_SSL must be true or false.");
  }
  const pool = new Pool({
    connectionString: databaseUrl,
    ...(sslSetting === "true" ? { ssl: { rejectUnauthorized: true } } : {}),
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000
  });
  return { pool, turns: new PostgresTurnRepository(pool) };
}
