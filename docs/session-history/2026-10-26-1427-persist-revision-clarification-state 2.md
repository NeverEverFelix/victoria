# Session: Persist Revision Clarification State

- Date: 2026-10-26
- Time: 14:27 America/New_York
- Status: Completed
- Scope: Preserve the pending proposal's revision-clarification gate across runtime restarts.

## Outcome

Persistent chat now has an append-only record for an active proposal that is waiting for a valid revision amount. The pending action store restores that record with the same action and proposal identity.

## Work Completed

- Added optional `awaitingValidRevision` to the persisted pending-savings action contract and wired it through restore and commit in [VictoriaAgent](../../src/agent/victoria-agent.ts).
- Added a user-, conversation-, action-, and proposal-scoped append-only clarification marker in migration `0022`, mirrored for both [local migrations](../../db/migrations/0022_persist_revision_clarifications.sql) and [Supabase migrations](../../supabase/migrations/0022_persist_revision_clarifications.sql).
- Updated the [PostgreSQL pending action store](../../src/app/savings/postgres-pending-savings-action-store.ts) to write and restore the marker atomically with pending action persistence.
- Added a restart-flow test proving approval stays blocked after restart, the clarified amount creates a linked replacement, and the replacement requires fresh approval.
- Added store-level read/write tests and a migration-copy parity test.
- Updated the [agent work queue](../agent-work-queue.md), [ADR 0001](../architecture/decisions/0001-orchestrated-multi-agent-architecture.md), and [test plan](../test-plan.md).

## Decisions

- Revision-clarification state is an append-only fact linked to the immutable proposal/action. A replacement proposal receives a new action identity and does not inherit the old clarification marker.
- The marker migration has not been applied to a local or hosted database in this session.

## Verification

- Restart-flow and pending-action store tests passed.
- `npm run check` passed: 75 test files passed, 8 skipped; 683 tests passed, 19 skipped, 9 todo.
- `git diff --check` passed.
- The paired `db/migrations` and `supabase/migrations` copies of migration `0022` are identical.
- Existing warnings: one unused-variable ESLint warning in `tests/unit/agent/memory-orchestrator.test.ts` and Node experimental SQLite warnings.

## Unresolved

- Changes remain local, uncommitted, and unpushed.
- Apply migration `0022` to the persistent local database before validating restart behavior in the local persistent chat runtime; staging and production rollout remain separate deployment steps.
- The broader typed conversation-state contract and references to older or non-active durable events remain open.

## Recommended Next Step

Apply migration `0022` through the guarded local migration path, then run the same revision-clarification sequence through persistent local chat across a server restart.
