# Session: Persistent goal-allocation approval

- Date: 2026-10-18
- Time: 20:46 America/New_York
- Status: Completed
- Scope: Restore local pending goal-allocation approvals after runtime restart and persist terminal outcomes.

## Outcome

Local persistent chat now resumes a pending goal allocation with the same action and approval identifiers. Approval, decline, and supersession produce append-only terminal records. If the allocation write committed but its terminal reply was lost, the retry recovers the original approval from the allocation record and completes the same action idempotently.

## Work Completed

- Added the `PendingGoalAllocationActionStore` contract and PostgreSQL adapter for pending snapshots, separate immutable approval records, and terminal transitions.
- Wired restore and commit into the local persistent runtime. Persistent goal action and approval IDs now use the configured unique ID factory.
- Hydrated persistent savings entries before checking their effective amount during a resumed approval.
- Added migration `0013_local_goal_allocation_actions.sql` and its Supabase migration symlink. It is local-only and was not applied to hosted Supabase.
- Added an integration scenario covering restart approval, lost terminal reply recovery, and restart decline followed by a stale approval attempt.
- Updated [the MVP contract](../mvp.md), [environment notes](../environments.md), [the agent work queue](../agent-work-queue.md), and [the test plan](../../tests/test-plan.md).

## Decisions

- Confirmed behavior: goal allocation proposal, issued approval, and terminal outcome are separate append-only records; decline and supersession never create a ledger allocation.
- The local mock ledger remains the only savings destination. No UI, login, hosted migration, or real money movement was added.

## Verification

- `npm run check` passed: 470 tests passed, 13 skipped, 9 todo. One pre-existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts`.
- The fresh local PostgreSQL persistent-chat integration suite passed: 9 tests.
- Migrations `0012` and `0013` are recorded in the configured local database, and the goal approval/transition tables are present.
- The disposable `victoria_integration_local` database was dropped after verification.

## Unresolved

- Savings-entry corrections are still not durably stored in local persistent mode, so effective amount reads do not yet incorporate correction history across restarts.
- Trusted sign-in, staging/production chat wiring, local semantic embeddings, physical retention/deletion policy, and memory UI remain outside this slice.
- The working tree contains broader uncommitted work from earlier sessions; this session did not commit changes.

## Recommended Next Step

Add append-only persistence for savings-entry corrections and make effective amount reads include those corrections, then verify correction and goal allocation behavior across runtime restarts.
