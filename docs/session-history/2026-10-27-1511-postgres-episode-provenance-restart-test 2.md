# Session: PostgreSQL Episode Provenance Restart Coverage

- Date: 2026-10-27
- Time: 15:11 EDT
- Status: Partial
- Scope: Add database-backed regression coverage for source-turn metadata persistence and link-aware episode suppression after repository restart.

## Outcome

Added an opt-in PostgreSQL integration case that persists a source-linked fact and episode, forgets the fact, constructs a fresh repository, and verifies the episode is suppressed by the persisted lifecycle marker.

## Work Completed

- Added the restart case to [postgres-persistent-chat.integration.test.ts](../../tests/integration/memory/postgres-persistent-chat.integration.test.ts).
- Kept the test under the existing safe-local-database and `RUN_POSTGRES_MEMORY_CHAT_INTEGRATION=true` gate.

## Decisions

- Use the existing memory JSONB metadata and append-only lifecycle records; this behavior needs no schema migration.
- Test source-turn references after creating a fresh repository over the same PostgreSQL pool, which exercises the durable storage representation without creating an external account or service.

## Verification

- `npm run check`: passed; 81 test files passed, 9 skipped; 739 tests passed, 24 skipped, 9 todo.
- `git diff --check`: passed.
- The PostgreSQL integration test was skipped because `DATABASE_URL` is not configured in this environment.
- Existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted experimental SQLite warnings.

## Unresolved

- The database-backed case has not been executed against PostgreSQL in this environment.
- The separate queued-turn acceptance endpoint still has no agent worker.

## Recommended Next Step

Run the opt-in test against the local loopback `_local` PostgreSQL database after its migrations are applied; then decide whether to continue with the queued-turn worker boundary.
