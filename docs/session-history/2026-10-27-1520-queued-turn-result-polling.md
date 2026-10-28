# Session: Queued Turn Result Polling

- Date: 2026-10-27
- Time: 15:20 EDT
- Status: Partial
- Scope: Persist queued-turn responses atomically with completion and expose owner-scoped result polling.

## Outcome

Queued-turn completion now stores the generated response payload in the same compare-and-transition update. Persistent and local PostgreSQL runtimes expose an authenticated handler to poll status and retrieve the public response fields after completion.

## Work Completed

- Added nullable JSONB `result_payload` to `victoria_turns` in [migration 0026](../../db/migrations/0026_persist_turn_results.sql) and the matching Supabase migration.
- Extended turn lifecycle persistence so the queued processor writes payload and completion status transactionally.
- Added [turn-result-handler.ts](../../src/app/http/turn-result-handler.ts), which scopes reads by authenticated user/conversation and returns only message, action, and classification.
- Exposed result polling from persistent and local PostgreSQL runtimes.
- Added repository and route boundary tests; updated the deep dive and test plan.

## Decisions

- Keep response payload optional for compatibility with completed turns created by the synchronous path.
- Treat database JSON as untrusted at the HTTP boundary and reject malformed response payloads.
- Continue leaving queue scheduling to the host application; the runtime provides the processor and polling handler.

## Verification

- `npm run check`: passed; 83 test files passed, 9 skipped; 746 tests passed, 24 skipped, 9 todo.
- `git diff --check`: passed.
- Existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted experimental SQLite warnings.
- PostgreSQL integration tests could not run because `DATABASE_URL` is not configured.

## Unresolved

- Hosting code still needs to register the result handler and invoke the processor from its queue consumer.
- PostgreSQL schema migration 0026 has not been applied or exercised in this environment.
- The earlier source-provenance PostgreSQL restart test remains unexecuted without a local database.

## Recommended Next Step

Integrate the processor and polling handler into the host's worker/API routes, then run both PostgreSQL integration cases against a migrated loopback `_local` database.
