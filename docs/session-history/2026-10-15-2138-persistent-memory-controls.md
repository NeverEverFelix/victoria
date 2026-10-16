# Session: Persistent memory control wiring

- Date: 2026-10-15
- Time: 21:38 EDT
- Status: Completed
- Scope: Prepare the authenticated PostgreSQL-backed runtime to expose memory controls and verify their database migrations and execution permissions.

## Outcome

The explicit persistent agent composition now returns review, correction, selected-forget, Forget all, and pause/resume handlers wired to its PostgreSQL/SQLite memory provider. The host must provide a trusted request authenticator.

## Work Completed

- Added the injected `authenticate(request)` boundary and memory control handlers to [createPersistentVictoriaAgent](../../src/app/create-persistent-victoria-agent.ts).
- Kept app route mounting on the local mock runtime because no live authenticated app runtime is currently configured. Product/runtime notes are in [decisions](../../docs/decisions.md), [MVP](../mvp.md), and [agent work queue](../agent-work-queue.md).
- Applied migrations `0009_user_memory_controls.sql` and `0010_memory_controls_settings.sql` in a throwaway local PostgreSQL database with synthetic prerequisite memory schema. The database and temporary `service_role` were removed after verification.
- Verified `service_role` can execute selected/all forget functions; `anon` and `authenticated` cannot. Verified `service_role` can manage `victoria_memory_settings` while `authenticated` has no direct table privileges. Exercised selected deletion and Forget all: linked conversational facts and embeddings were deleted, while a Plaid profile fact and its embedding remained.
- Expanded the static migration contract for the `SECURITY DEFINER`, fixed search path, and restricted function grants.

## Decisions

- Persistent controls use the same host-provided trusted authenticator as other server-side authenticated boundaries. The persistent factory does not invent a login/session system.
- Live route activation remains future work; current Next.js routes still use the local mock runtime.
- The workspace had no configured Victoria database or `DATABASE_URL`. Verification used an isolated scratch database and synthetic prerequisites; no project or Supabase database was altered.

## Verification

- `git diff --check` passed.
- `npm run check` passed: 56 test files passed, 6 skipped; 462 tests passed, 4 skipped, 9 todo.
- Existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts:48`; Node reports the existing experimental SQLite warning.

## Unresolved

- Bind the persistent handlers to the Next.js routes when a live runtime and trusted authentication provider are selected.
- Apply the migrations through the repository migration runner to the eventual project-local/test/Supabase database after its supported schema and pgvector extension are available.

## Recommended Next Step

- When configuring the live runtime, inject its trusted authenticator into `createPersistentVictoriaAgent`, mount the returned handlers, and run the complete migration chain against the intended non-production database before enabling the settings endpoints.
