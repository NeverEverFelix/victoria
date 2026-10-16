# Session: Memory privacy boundary tests

- Date: 2026-10-15
- Time: 21:47 EDT
- Status: Completed
- Scope: Verify user isolation, immediate memory removal, profile disconnect cleanup, and pause/delete behavior.

## Outcome

Added regression coverage for privacy controls and fixed two gaps found during review: mock memory IDs could collide across users, and Plaid profile disconnect did not remove correction facts linked through `correctionOfMemoryId`.

## Work Completed

- Made mock memory IDs unique across all users handled by one provider.
- Added orchestrator tests proving scoped search/forget, wrong-user deletion rejection, paused facts remaining reviewable but excluded from conversational retrieval, deleted facts staying absent after resume, and separately consented Plaid profile memory remaining available while conversational memory is paused.
- Added Postgres repository coverage for absence from semantic retrieval after a successful forget call; migration contract coverage checks that linked memory embeddings are removed.
- Added migration `0011_plaid_profile_correction_purge.sql`: profile disconnect now removes Plaid facts, superseding descendants, `correctionOfMemoryId` descendants, and their embeddings while preserving unrelated user facts.
- Verified the new SQL on an isolated temporary PostgreSQL database with synthetic prerequisite schema: profile and dependent correction rows/embeddings were removed; unrelated memory and a second user's profile remained. The temporary database and role were removed.
- Updated [test plan](../../tests/test-plan.md) and [user learning schema](../specification/user-learning-schema.md).

## Decisions

- Pause blocks conversational-memory retrieval while retaining saved facts for review and resumption. Profile facts remain controlled by separate Plaid consent/disconnect behavior.
- Disconnecting the profile also erases transaction-detail correction facts linked to that profile's memories, along with their embeddings.

## Verification

- `git diff --check` passed.
- `npm run check` passed: 56 test files passed, 6 skipped; 467 tests passed, 4 skipped, 9 todo.
- Existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts:95`; Node reports the existing experimental SQLite warning.
- The profile purge SQL was executed against an isolated temporary local PostgreSQL database; no project or Supabase database was modified.

## Unresolved

- The full configured Postgres/pgvector runtime is not available in this workspace. Durable behavior is covered by repository and migration tests plus the isolated SQL verification.

## Recommended Next Step

- When a persistent environment is configured, run the full migration chain and the same privacy checks against a non-production database with pgvector enabled.
