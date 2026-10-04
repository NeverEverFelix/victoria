# Session: Goal Allocation On Pending Savings

- Date: 2026-10-03
- Time: 18:52 EDT
- Status: Completed
- Scope: Attach a named savings goal to a pending savings suggestion and require approval for the updated destination.

## Outcome

Victoria can apply a clear goal name to a pending savings proposal, ask the user to confirm the updated proposal, and record that goal on the mocked ledger entry after approval.

## Work Completed

- Added optional `goalName` to savings proposals, ledger entries, and the create-entry tool input.
- Updated the agent to preserve the pending suggestion, replace its action ID when the goal changes, and require approval against that new action ID.
- Updated the mock tool and approval response to retain and report the goal destination.
- Added tests for pending goal allocation, fresh approval binding, stale approval rejection, no entry before confirmation, and missing savings context.
- Updated [agent-work-queue.md](../agent-work-queue.md) and [test-plan.md](../../tests/test-plan.md).

## Decisions

- Confirmed behavior: a goal destination added to a pending savings suggestion is part of the approved action; changing the destination requires a fresh action ID and confirmation.
- Scope boundary: this slice handles pending suggestions. Updating an already-recorded entry needs an immutable linked record and remains future work.

## Verification

- `npm test -- --run tests/unit/agent/victoria-agent.test.ts` passed: 18 tests passed.
- `npm run check` passed: setup validation, type checks, and 101 tests passed; 25 tests remain todo and 1 test file is skipped.
- Lint reports three existing warnings in `src/agent/memory/mock-memory.ts` and `tests/unit/agent/policy.test.ts`.
- `git diff --check` passed.

## Unresolved

- Goal allocation to an already-recorded savings entry is not implemented.
- The recognized mock goal name currently comes from the deterministic classifier; user-specific goal lookup is not part of this slice.
- Worktree still contains uncommitted weekly progress changes from the preceding session; they were left intact.

## Recommended Next Step

- Review the remaining no-real-money-movement user story and cover the natural-language request path end to end, then return to immutable goal updates for confirmed entries.
