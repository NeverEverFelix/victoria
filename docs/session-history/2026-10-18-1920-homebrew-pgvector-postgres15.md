# Session: Homebrew PostgreSQL 15 pgvector setup

- Date: 2026-10-18
- Time: 19:20 America/New_York
- Status: Completed
- Scope: Install the official pgvector extension for the existing Homebrew PostgreSQL 15 service and prepare a local Victoria database.

## Outcome

Installed pgvector 0.8.7 into Homebrew PostgreSQL 15 and applied Victoria migrations 0001–0009 to `victoria_local` on loopback port 5432. No UI, account signup, or login flow was used.

## Work Completed

- Built and installed upstream pgvector v0.8.7 using the Homebrew PostgreSQL 15 `pg_config`; overrode its stale SDK reference with the installed Xcode 26.1 SDK.
- Added a non-login `postgres` compatibility role to [db/local/init.sql](../../db/local/init.sql), required by migration 0009 on a Homebrew cluster.
- Created `victoria_local`, applied the local Supabase-compatible role/auth shim, then ran the guarded local migration runner.
- The separately managed Docker PostgreSQL service on port 5433 remains available and unchanged.

## Decisions

- Keep the Docker PostgreSQL 15 + pgvector service as the documented default local database. Homebrew PostgreSQL 15 is available as an alternative on this machine.
- The Homebrew cluster owner remains the local migration user; the compatibility `postgres` role is non-login and only exists for migration compatibility.

## Verification

- `vector` appears in `pg_available_extensions` with default version `0.8.7` for Homebrew PostgreSQL 15.
- The Homebrew `victoria_local` database reports pgvector `0.8.7`, has 9 recorded Victoria migrations, and can parse a `vector` value.
- Applied `db/local/init.sql` and `npm run db:migrate` with `APP_ENV=local`, `NODE_ENV=development`, loopback `DATABASE_URL`, and `ALLOW_DB_MIGRATE=true`.
- The full npm check was not rerun; this session changed only the local SQL compatibility bootstrap and machine-local PostgreSQL installation. The prior session ran the full check successfully.

## Unresolved Gaps

- `.env.example` still points to the Docker database on port 5433; using Homebrew requires setting `DATABASE_URL` to the local PostgreSQL 15 instance and setting `VICTORIA_MEMORY_MODE=persistent` in ignored `.env.local`.
- The local chat still uses its existing signed-session boundary and mock ledger. No trusted sign-in or user-facing memory controls were added here.

## Recommended Next Step

If the user wants the local app to use this Homebrew database, set its ignored `.env.local` database URL and memory mode, then exercise a persistent chat turn through the existing headless route tests or local runtime.
