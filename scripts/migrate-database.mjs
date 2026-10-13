import { loadEnvConfig } from "@next/env";
import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

loadEnvConfig(process.cwd());
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to run database migrations.");

const migrationsDirectory = fileURLToPath(new URL("../db/migrations/", import.meta.url));
const migrationNames = (await readdir(migrationsDirectory))
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
  .sort();
const pool = new Pool({ connectionString, max: 1, connectionTimeoutMillis: 5_000 });

try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await client.query("SELECT pg_advisory_xact_lock($1)", [73422109]);
    await client.query(`CREATE TABLE IF NOT EXISTS victoria_schema_migrations (
      name text PRIMARY KEY,
      applied_at timestamptz NOT NULL DEFAULT now()
    )`);
    for (const filename of migrationNames) {
      const migrationName = filename.slice(0, -4);
      const applied = await client.query("SELECT name FROM victoria_schema_migrations WHERE name = $1", [migrationName]);
      if (applied.rowCount === 0) {
        const migrationPath = fileURLToPath(new URL(`../db/migrations/${filename}`, import.meta.url));
        const migrationSql = await readFile(migrationPath, "utf8");
        await client.query(migrationSql);
        await client.query("INSERT INTO victoria_schema_migrations (name) VALUES ($1)", [migrationName]);
      }
    }
    await client.query("COMMIT");
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
