# Session: Persistent Chat PostgreSQL Verification

- Date: 2026-10-18
- Time: 19:06 America/New_York
- Status: Completed
- Scope: Verify local persistent-memory chat across fresh agent runtimes against a disposable PostgreSQL database with pgvector.

## Outcome

The opt-in local persistent-memory chat path passed an end-to-end PostgreSQL check: one runtime stored an explicit user preference, a fresh runtime recalled it, and a second user did not receive it. Live database verification exposed and fixed a repository insert bug where missing `source_metadata` was sent as SQL NULL despite the schema's NOT NULL constraint.

## Work Completed

- Added [postgres-persistent-chat.integration.test.ts](../../tests/integration/memory/postgres-persistent-chat.integration.test.ts), gated behind `RUN_POSTGRES_MEMORY_CHAT_INTEGRATION=true` and an exact `victoria_integration_local` loopback database name. The test uses unique users and leaves cleanup to disposal of that dedicated database because memory records are append-only.
- Added an explicit local persistent-pool shutdown helper for integration cleanup.
- Updated [postgres-memory-repository.ts](../../src/agent/memory/postgres-memory-repository.ts) to store `{}` when no source metadata is provided, matching migration `0004`'s NOT NULL JSON object contract. Added a unit assertion.
- The existing PostgreSQL 15 service lacked pgvector. Its newly created empty `victoria_local` database was dropped after the migration attempt rolled back. Used a temporary container on loopback port 5433 with pgvector, seeded the minimal Supabase roles and `auth.uid()` function expected by the migration set, applied all local migrations, and ran the integration test successfully. The container was stopped with `--rm`; the pre-existing `fabrics_local` database was untouched.
- Updated the test plan to describe the dedicated disposable database guard.

## Decisions

- Confirmed: database-backed integration checks use a dedicated disposable local database because memory and decision history is append-only and must not be deleted for test cleanup.
- Confirmed: no UI, signup/login flow, staging connection, or production behavior was added.

## Verification

- Guarded `npm run db:migrate` completed successfully against the disposable PostgreSQL 15 + pgvector database after seeding Supabase compatibility roles/functions.
- `RUN_POSTGRES_MEMORY_CHAT_INTEGRATION=true npx vitest run tests/integration/memory/postgres-persistent-chat.integration.test.ts` passed: 1 test.
- `npm run check` passed: 470 tests passed, 5 skipped, and 9 todo. The integration test is skipped in the normal suite unless its explicit disposable-database opt-in is set. Existing ESLint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:83`; Node's experimental SQLite warnings remain.
- `git diff --check` passed.

## Unresolved

- The installed PostgreSQL 15 service still lacks pgvector, so it cannot host the full migration set without a compatible extension installation.
- Local persistent mode still uses bounded recent memories rather than vector embeddings; staging/production persistent chat and durable pending-action state are not wired.
- The memory-management API still has no user-facing UI, and physical retention/deletion remains incomplete.

## Recommended Next Step

Decide whether local persistent memory should use the existing SQLite cache plus PostgreSQL outbox or direct PostgreSQL context, then build the next slice around restoring clarification and approval state safely across agent restarts. Keep staging chat and client authentication deferred until those state and RLS boundaries are covered.
