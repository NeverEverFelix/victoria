import { createRequire } from "node:module";
import { spawnSync } from "node:child_process";

const require = createRequire(import.meta.url);
const { loadEnvConfig } = require("@next/env");
loadEnvConfig(process.cwd());

if (!process.env.VICTORIA_LOCAL_DB_PASSWORD?.trim()) {
  throw new Error("Set VICTORIA_LOCAL_DB_PASSWORD in .env.local before starting local Postgres.");
}

const result = spawnSync("docker", ["compose", "up", "-d", "postgres"], {
  stdio: "inherit",
  env: process.env
});
if (result.error) throw result.error;
process.exitCode = result.status ?? 1;
