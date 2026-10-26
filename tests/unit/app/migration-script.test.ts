import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const migrationScript = new URL("../../../scripts/migrate-database.mjs", import.meta.url);

describe("database migration runner safety gates", () => {
  it.each([
    "0022_persist_revision_clarifications.sql",
    "0023_persist_revision_target_clarifications.sql",
    "0024_conversation_scoped_savings_events.sql"
  ])(
    "keeps the local and Supabase copies of migration %s identical", (filename) => {
      const localMigration = new URL(`../../../db/migrations/${filename}`, import.meta.url);
      const supabaseMigration = new URL(`../../../supabase/migrations/${filename}`, import.meta.url);
      expect(readFileSync(localMigration, "utf8")).toBe(readFileSync(supabaseMigration, "utf8"));
    }
  );

  it("limits service-role access to append-only savings event operations", () => {
    const migration = readFileSync(new URL("../../../db/migrations/0024_conversation_scoped_savings_events.sql", import.meta.url), "utf8");
    expect(migration).toContain("REVOKE ALL ON victoria_local_savings_events FROM service_role");
    expect(migration).toContain("GRANT SELECT, INSERT ON victoria_local_savings_events TO service_role");
    expect(migration).not.toContain("GRANT ALL ON victoria_local_savings_events TO service_role");
  });

  it("requires explicit opt-in before opening a database connection", () => {
    const result = spawnSync(process.execPath, [migrationScript.pathname], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        APP_ENV: "local",
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://example:example@127.0.0.1:5432/example",
        ALLOW_DB_MIGRATE: "false",
        DB_SSL: "false"
      }
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("migrations are opt-in");
    expect(result.stderr).not.toContain("ECONNREFUSED");
  });

  it("refuses production even when the local opt-in flag is set", () => {
    const result = spawnSync(process.execPath, [migrationScript.pathname], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        APP_ENV: "production",
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://example:example@127.0.0.1:5432/example",
        ALLOW_DB_MIGRATE: "true",
        DB_SSL: "false"
      }
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("correctly paired local or test environment");
    expect(result.stderr).not.toContain("ECONNREFUSED");
  });

  it("refuses a remote database even when local environment flags are correct", () => {
    const result = spawnSync(process.execPath, [migrationScript.pathname], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        PATH: process.env.PATH ?? "",
        HOME: process.env.HOME ?? "",
        APP_ENV: "local",
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://example:example@db.example.com:5432/victoria_local",
        ALLOW_DB_MIGRATE: "true",
        DB_SSL: "true"
      }
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("loopback PostgreSQL host");
    expect(result.stderr).not.toContain("ECONNREFUSED");
  });
});
