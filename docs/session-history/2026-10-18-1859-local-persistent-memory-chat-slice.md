# Session: Local Persistent Memory Chat Slice

- Date: 2026-10-18
- Time: 18:59 America/New_York
- Status: Completed
- Scope: Add a smallest headless path for local chat to use PostgreSQL-backed memory without adding UI, signup, or login flows.

## Outcome

Local chat can opt into PostgreSQL-backed short-term context and durable conversational memories while retaining the existing local signed-session boundary, mock model, and mock savings ledger. Mock memory remains the default. This does not connect persistent chat to staging or production.

## Work Completed

- Added `VICTORIA_MEMORY_MODE=mock` to the example environment. Setting it to `persistent` selects `PostgresMemoryRepository` for local chat and uses direct PostgreSQL context storage so context writes are awaited rather than relying on an ephemeral SQLite outbox.
- Persistent mode passes through `parseVictoriaEnv`, which restricts the runtime to local development and validates the loopback local database and local auth secret. Unknown memory-mode values fail closed.
- Kept profile refreshes connected to the existing local estimate provider and also persisted their profile facts in persistent mode.
- Added a route configuration test and updated the MVP, work queue, and test plan.
- The worktree already contained other in-progress changes before this slice; they were not reverted or claimed as part of this work.

## Decisions

- Confirmed: this first persistence slice remains local-only, opt-in, and headless. No UI, signup, or login work is included.
- Confirmed: the local model and ledger remain mocked; memory does not approve any financial action.
- Deferred: vector embeddings and semantic relevance in this mode. Without embeddings, retrieval uses bounded recent current facts.
- Deferred: authenticated persistent chat in staging/production and user-facing memory controls.

## Verification

- `npm run check` passed: 470 tests passed, 4 skipped, and 9 todo. Existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts:83`; Node reports its existing experimental SQLite warnings.
- `git diff --check` passed.
- No local database migrations were run and no database connection, staging endpoint, or provider service was exercised.

## Unresolved

- Local PostgreSQL migrations must already be applied before persistent mode is used; this session did not configure or migrate a database.
- Persistent mode has no semantic embeddings yet and has not been exercised against a running PostgreSQL database.
- Staging/production chat still needs an appropriate trusted identity and database access boundary, plus durable pending-action behavior and endpoint verification.
- Memory review/correction/forget APIs still have no UI; physical retention/deletion policy remains incomplete.

## Recommended Next Step

When a local `*_local` PostgreSQL database is available, apply the existing migrations intentionally and exercise memory continuity across two runtime instances and two users. Then add a separate staging chat route only after its database RLS scope and persistent pending-action lifecycle are designed and tested.
