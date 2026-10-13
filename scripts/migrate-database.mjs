import { createRequire } from "node:module";
import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());
if (process.env.ALLOW_DB_MIGRATE !== "1") {
  throw new Error("Database migrations are opt-in; set ALLOW_DB_MIGRATE=1 for an intentional local or test migration.");
}
if (process.env.APP_ENV === "production" || process.env.NODE_ENV === "production") {
  throw new Error("This migration runner is disabled in production; use a separately reviewed deployment migration process.");
}
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to run database migrations.");
const dbSsl = process.env.DB_SSL ?? "false";
if (dbSsl !== "true" && dbSsl !== "false") throw new Error("DB_SSL must be true or false.");

const migrationsDirectory = fileURLToPath(new URL("../db/migrations/", import.meta.url));
const migrationNames = (await readdir(migrationsDirectory))
  .filter((name) => /^\d{4}_[a-z0-9_]+\.sql$/.test(name))
  .sort();
const pool = new Pool({
  connectionString,
  ...(dbSsl === "true" ? { ssl: { rejectUnauthorized: true } } : {}),
  max: 1,
  connectionTimeoutMillis: 5_000
});

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
