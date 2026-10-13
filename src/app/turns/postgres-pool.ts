import { Pool } from "pg";
import { PostgresTurnRepository } from "./postgres-turn-repository.js";

/** Creates the shared PostgreSQL pool used by a server process. Call pool.end() at shutdown. */
export function createPostgresTurnStore(databaseUrl: string): {
  pool: Pool;
  turns: PostgresTurnRepository;
} {
  const pool = new Pool({
    connectionString: databaseUrl,
    max: 5,
    connectionTimeoutMillis: 5_000,
    idleTimeoutMillis: 10_000
  });
  return { pool, turns: new PostgresTurnRepository(pool) };
}
