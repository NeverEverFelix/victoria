# Session: Unsupported revision target guard

- Date: 2026-10-26
- Time: 17:15 America/New_York
- Status: Completed
- Scope: Prevent a revision that cannot be tied to the active savings proposal from being reinterpreted as an active proposal edit or approval.

## Outcome

When a revision cannot be matched to the active proposal, Victoria now gives a clear unsupported-target response. A distinct append-only target-clarification marker blocks both “Yes” and amount-only replies until the active proposal is declined. The marker survives local PostgreSQL runtime restarts. Historical event resolution remains unsupported because no ownership-scoped event lookup exists.

## Work Completed

- Tightened active event/proposal reference resolution to reject explicit references to another, earlier, or previous event instead of falling back to the one active proposal.
- Added `awaitingRevisionTarget` state separate from the existing amount clarification. While that state is active, approval and amount-only replies are blocked; explicit decline remains available.
- Added migration `0023_persist_revision_target_clarifications.sql` in both local and Supabase migration directories, with user/conversation/proposal/action links, append-only protection, and RLS.
- Updated the PostgreSQL pending-action store to persist and restore the target marker.
- Added unit, migration-parity, and persistent-chat restart tests; updated [the work queue](../agent-work-queue.md), [user stories](../user-stories.md), [test plan](../../tests/test-plan.md), and [the MVP safety contract](../specification/mvp-safety-contract.md).

## Decisions

- Until an authoritative user- and conversation-scoped prior-event source exists, Victoria does not target older events from transcript matches.
- If a revision cannot be grounded to the active proposal, the current proposal remains pending and cannot be approved or revised by a bare amount. The user may decline it before starting a separate request.
- Migration `0023` was applied only to the isolated `victoria_integration_local` database for verification. No staging/production migration was run.

## Verification

- Focused tests: 4 files passed, 141/141 tests.
- `npm run check`: passed; 692 tests passed, 21 skipped, 9 todo. Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted existing experimental SQLite warnings.
- PostgreSQL persistent chat integration against loopback `victoria_integration_local`: passed, 15/15 tests, including restart restoration of the target marker.
- `git diff --check`: passed.

## Unresolved

- Older/non-active event targeting remains unsupported; implementing it requires an authoritative, ownership-scoped read-only event source.
- The cumulative code and migrations remain local and uncommitted. Migration `0023` has not been deployed to any hosted environment.

## Recommended Next Step

- Continue with an independently bounded conversation reliability gap. If historical-event targeting is prioritized, design and review its scoped read-only event source before adding a resolver; keep unmatched targets on the safe decline-and-restart path.
