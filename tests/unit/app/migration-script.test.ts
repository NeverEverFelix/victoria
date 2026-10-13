import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const migrationScript = new URL("../../../scripts/migrate-database.mjs", import.meta.url);

describe("database migration runner safety gates", () => {
  it("requires explicit opt-in before opening a database connection", () => {
    const result = spawnSync(process.execPath, [migrationScript.pathname], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        APP_ENV: "local",
        NODE_ENV: "development",
        DATABASE_URL: "postgresql://example:example@127.0.0.1:5432/example",
        ALLOW_DB_MIGRATE: "false"
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
        ...process.env,
        APP_ENV: "production",
        NODE_ENV: "production",
        DATABASE_URL: "postgresql://example:example@127.0.0.1:5432/example",
        ALLOW_DB_MIGRATE: "1"
      }
    });

    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("disabled in production");
    expect(result.stderr).not.toContain("ECONNREFUSED");
  });
});
