# Session: Persist pending savings-entry corrections

- Date: 2026-10-25
- Time: 17:23 EDT (America/New_York)
- Status: Partial
- Scope: Close the process-local pending correction gap identified by the conversation failure analysis without extending context-builder work.

## Outcome

Pending savings-entry correction proposals can now be restored by a fresh persistent chat runtime, and terminal approval/decline outcomes are recorded append-only. Approved correction adjustments were already durable; this change adds durability for the approval conversation itself.

## Work Completed

- Added the `PendingEntryCorrectionStore` seam and PostgreSQL implementation in [the pending correction store](../../src/app/savings/postgres-pending-entry-correction-store.ts).
- Added paired canonical and Supabase migration [0021](../../db/migrations/0021_persist_pending_entry_corrections.sql) for user-scoped proposal snapshots, terminal transitions, immutability, and RLS.
- Wired persistence into the local and hosted runtimes and the [agent lifecycle](../../src/agent/victoria-agent.ts). Correction approval IDs derive from their persisted action ID so retries after restart retain the same idempotency identity.
- Added an opt-in PostgreSQL restart integration scenario and updated [MVP](../mvp.md), [test plan](../../tests/test-plan.md), [environment guide](../environments.md), and [work queue](../agent-work-queue.md).

## Decisions

- Confirmed: entry corrections still require exact approval; the original ledger entry stays immutable and adjustments remain separate linked records.
- Confirmed: context-builder development stays paused while long-session dialogue state, structured tracing, and asynchronous memory processing remain open.

## Verification

- `npm run check` passed: 70 test files passed, 8 skipped; 649 tests passed, 19 skipped, 9 todo. The existing unused-variable warning in `memory-orchestrator.test.ts` remains; SQLite emits experimental-feature warnings.
- `git diff --check` passed; canonical and Supabase copies of migration `0021` match.
- The PostgreSQL restart integration test is opt-in and was skipped in the default check. Migration `0021` was not applied to local, staging, or production databases during this session.

## Unresolved

- Apply migration `0021` to the persistent local database and verify the restart scenario. Apply and verify it in staging before deploying the updated hosted runtime; production remains subject to its existing migration gate.
- Long-session dialogue state, structured tracing, and asynchronous memory jobs remain open. No context-builder changes were made.
- The worktree contained substantial pre-existing uncommitted conversation-response and context-builder work; it was preserved.

## Recommended Next Step

- Apply migration `0021` to the local test database and run the opt-in PostgreSQL restart scenario. Then choose one of the remaining non-context-builder conversation reliability gaps.
