# Session: Bootstrap local pgvector development database

- Date: 2026-10-16
- Time: 13:20 America/New_York
- Status: Completed
- Scope: Add a loopback-only Docker Postgres service with pgvector and apply Victoria's existing migrations without Supabase or live Plaid.

## Outcome

Local pgvector infrastructure is available and running. The complete existing migration chain applied successfully to the local database, including the semantic-memory tables, HNSW index, and search function.

## Work Completed

- Added [docker-compose.yml](../../docker-compose.yml) using the pgvector PostgreSQL 16 image, a persistent local Docker volume, and a loopback-only host port (default `54329`).
- Added [001-supabase-compatibility.sql](../../db/local/init/001-supabase-compatibility.sql) with local-only roles and an `auth.uid()` shim needed by the Supabase-oriented migrations.
- Added `db:local:up` and `db:local:down` scripts and documented the local workflow in [environments.md](../environments.md).
- Updated the example local database URL and [user-learning-schema.md](../specification/user-learning-schema.md) to describe local pgvector as a pre-Supabase setup path and remove the obsolete memory settings screen claim.
- Docker Desktop was started because its daemon was initially stopped. The default host port 5432 was already occupied, so the local service uses 54329 by default.

## Decisions

- Confirmed by the user: set up pgvector and related local infrastructure before configuring Supabase or live integrations.
- The local service binds to loopback, uses a disposable local password, and does not initialize Plaid or connect to Supabase.
- No product behavior or real financial integration was enabled.

## Verification

- `npm run db:local:up` started `pgvector/pgvector:pg16` after Docker Desktop was available.
- `APP_ENV=local NODE_ENV=development DATABASE_URL=postgresql://victoria:victoria_local_dev_only@localhost:54329/victoria_local ALLOW_DB_MIGRATE=true DB_SSL=false npm run db:migrate` applied all 13 available migrations.
- Confirmed pgvector 0.8.7 is installed in schema `extensions`, the semantic-memory HNSW index exists, and `victoria_search_conversational_memories` is present.
- `git diff --check` passed. The automated test suite was not run because this infrastructure setup did not change application behavior.

## Unresolved

- The persistent runtime is not mounted in the chat app; local chat still uses mock memory by default.
- No embedding API key was configured, so semantic indexing and similarity queries have not been exercised through the application adapter.
- No local synthetic transaction-profile import has been wired through the persistent profile writer. Plaid remains unconfigured and disabled.
- The existing worktree contained other uncommitted changes before this session; they were left intact.

## Recommended Next Step

- Add a local-only path to run the existing persistent memory and profile adapters against this database with deterministic test embeddings and synthetic transaction data, then verify semantic recall and transaction-derived estimates without Plaid or external credentials.
