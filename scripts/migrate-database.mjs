import { createRequire } from "node:module";
import { Pool } from "pg";
import { readFile, readdir } from "node:fs/promises";
import { fileURLToPath } from "node:url";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());
if (process.env.ALLOW_DB_MIGRATE !== "true" && process.env.ALLOW_DB_MIGRATE !== "false") {
  throw new Error("ALLOW_DB_MIGRATE must be true or false.");
}
if (process.env.ALLOW_DB_MIGRATE !== "true") {
  throw new Error("Database migrations are opt-in; set ALLOW_DB_MIGRATE=true for an intentional local or test migration.");
}
const connectionString = process.env.DATABASE_URL;
if (!connectionString) throw new Error("DATABASE_URL is required to run database migrations.");
const appEnv = process.env.APP_ENV;
const expectedNodeEnv = appEnv === "local" ? "development" : appEnv === "test" ? "test" : null;
if (!expectedNodeEnv || process.env.NODE_ENV !== expectedNodeEnv) {
  throw new Error("The migration runner is limited to a correctly paired local or test environment.");
}
const databaseUrl = new URL(connectionString);
if (!["localhost", "127.0.0.1", "::1"].includes(databaseUrl.hostname.toLowerCase())) {
  throw new Error("The migration runner only connects to a loopback PostgreSQL host.");
}
const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
const expectedDatabaseSuffix = appEnv === "local" ? "_local" : "_test";
if (!databaseName.endsWith(expectedDatabaseSuffix)) {
  throw new Error(`The ${appEnv} migration database name must end in ${expectedDatabaseSuffix}.`);
}
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
