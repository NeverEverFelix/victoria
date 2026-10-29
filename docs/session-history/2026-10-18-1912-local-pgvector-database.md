# Session: Local pgvector Database Setup

- Date: 2026-10-18
- Time: 19:12 America/New_York
- Status: Completed
- Scope: Provide and initialize a local PostgreSQL version with pgvector for Victoria's persistent-memory development path.

## Outcome

Added a dedicated Docker Compose PostgreSQL 15 + pgvector service on `127.0.0.1:5433`, separate from the existing Homebrew PostgreSQL service on port 5432. Victoria's local `victoria_local` database now has migrations `0001` through `0009` applied and persists in a named Docker volume.

## Work Completed

- Added [docker-compose.local.yml](../../docker-compose.local.yml) using `pgvector/pgvector:pg15`, loopback-only port binding, and a persistent named volume.
- Added [db/local/init.sql](../../db/local/init.sql) with the minimal local Supabase role names and `auth.uid()` shim required by the canonical migration files.
- Added `db:local:up` and `db:local:down` npm scripts, updated [.env.example](../../.env.example) for the port-5433 database URL, and documented setup in [environments.md](../environments.md) and [README.md](../../README.md).
- Started the Compose service and ran the existing guarded migration runner against `victoria_local`; confirmed all nine migrations are recorded.
- Ran the opt-in persistent chat integration test earlier in this session against a separate disposable database, then removed that test database/container.
- Left the existing Homebrew PostgreSQL 15 service and its `fabrics_local` database untouched. Compose reported an existing orphan container named `victoria-postgres-1`; it was left untouched.

## Decisions

- Confirmed: use a vector-enabled PostgreSQL 15 container on a separate local port rather than modifying the user's Homebrew PostgreSQL installation.
- Confirmed: keep persistent memory opt-in; `.env.example` still defaults `VICTORIA_MEMORY_MODE=mock`.
- Confirmed: no UI, signup/login flow, or hosted database mutation was part of this setup.

## Verification

- `npm run db:local:up` started the service successfully.
- `ALLOW_DB_MIGRATE=true npm run db:migrate` completed against loopback `victoria_local`.
- Queried the migration ledger and confirmed `0001_victoria_turns` through `0009_memory_api_rls_role` are applied.
- The disposable local PostgreSQL memory-chat integration test passed: 1 test.
- `npm run check` passed: 470 tests passed, 5 skipped, and 9 todo. Existing ESLint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:83`; SQLite experimental warnings remain.
- `docker compose -f docker-compose.local.yml config --quiet` and `git diff --check` passed.

## Unresolved

- No ignored `.env.local` was created. To run persistent chat, copy `.env.example`, set a strong local `AUTH_SECRET`, set `VICTORIA_MEMORY_MODE=persistent`, and keep the DB URL on port 5433.
- Persistent chat remains local-only; semantic embeddings, durable pending-action state, trusted client sign-in, and staging/production chat wiring remain future work.
- The pre-existing orphan container warning should be reviewed separately before any cleanup; this session intentionally did not remove it.

## Recommended Next Step

Copy the example environment into ignored `.env.local`, use persistent memory locally, and add durable clarification/pending-action state with restart and replay tests before connecting chat to staging.
