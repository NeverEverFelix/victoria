# Session: Local persistent goal allocation

- Date: 2026-10-18
- Time: 20:36 America/New_York
- Status: Completed
- Scope: Persist an approved savings goal allocation in local PostgreSQL mode without changing its linked mocked savings entry.

## Outcome

Local persistent mode stores approved goal allocations as immutable records linked to completed mocked ledger entries. Retried approvals return the existing record; action reuse with changed details and second allocations for the same entry are rejected.

## Work Completed

- Added migration `0012_local_savings_goal_allocations.sql` and its Supabase migration symlink. The table enforces one allocation per user/action and per entry, links to the mocked ledger entry, and rejects updates/deletes.
- Extended `PostgresMockSavingsTools` to validate ownership, completion status, mock-only mode, exact amount, and approval/action binding within a transaction; added durable reads and idempotent retries.
- Added a PostgreSQL chat integration scenario that confirms the approved record persists, retries safely, rejects changed details, and leaves the original entry unchanged.
- Updated [the MVP contract](../mvp.md), [environment notes](../environments.md), [the agent work queue](../agent-work-queue.md), and [the test plan](../../tests/test-plan.md).

## Decisions

- Confirmed behavior: a goal allocation is a new append-only mock-ledger record and does not mutate the original saved entry.
- Migration `0012` is local-only. It has not been applied to hosted Supabase projects.
- Pending goal-allocation proposals remain runtime-scoped and are not restored after restart.

## Verification

- `npm run check` passed: 470 tests passed, 12 skipped, 9 todo. The existing lint warning in `tests/unit/agent/memory-orchestrator.test.ts` remains.
- The guarded local migration runner applied migration `0012` to the configured local database.
- The isolated PostgreSQL persistent-chat integration suite passed: 8 tests, including the new allocation scenario.
- The disposable `victoria_integration_local` database was dropped after the run.

## Unresolved

- Pending goal-allocation proposals are not durable across a local runtime restart.
- Persistent savings-entry corrections are not yet implemented; allocating to an entry after a durable correction will need correction history and effective-amount reads in the persistence adapter.
- Trusted sign-in, staging/production chat wiring, and memory UI remain outside this local headless slice.
- The working tree contains broader uncommitted work from earlier sessions; this session did not commit changes.

## Recommended Next Step

Persist pending goal-allocation proposals and their terminal approval/decline result, then verify that a proposal can be resumed after a runtime restart with the same exact-action approval boundary.
