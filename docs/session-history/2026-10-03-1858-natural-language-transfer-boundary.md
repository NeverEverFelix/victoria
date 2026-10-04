# Session: Natural-Language Transfer Boundary

- Date: 2026-10-03
- Time: 18:58 EDT
- Status: Completed
- Scope: Route natural-language requests to move real money to an explicit MVP limitation response.

## Outcome

Victoria now recognizes direct requests to move, transfer, or send money and explains that it cannot move funds in the MVP. When a savings proposal is pending, the request does not approve it; Victoria offers to record that existing amount in the mocked ledger only after a clear confirmation.

## Work Completed

- Added `real_money_movement_request` classification to the deterministic mock adapter.
- Added an agent refusal response for transfer requests, with and without a pending savings proposal.
- Added behavior tests proving no entry is created and no tool call is returned for the transfer request.
- Linked the new test coverage to FIN-001 in the [MVP safety contract](../specification/mvp-safety-contract.md), updated the [test plan](../../tests/test-plan.md), and completed Slice 9 criteria in the [agent work queue](../agent-work-queue.md).

## Decisions

- Confirmed behavior: requesting a real transfer is never approval for a mocked ledger write. A separate explicit confirmation can approve only the pending mocked entry.
- The response explains both the real-transfer limitation and the available mocked-ledger option.

## Verification

- `npm test -- --run tests/unit/agent/victoria-agent.test.ts` passed: 20 tests passed.
- `npm run check` passed: setup validation, type checks, and 103 tests passed; 25 tests remain todo and 1 test file is skipped.
- Lint reports three existing warnings in `src/agent/memory/mock-memory.ts` and `tests/unit/agent/policy.test.ts`.
- `git diff --check` passed.

## Unresolved

- The deterministic mock classifier covers common direct transfer wording; natural-language understanding beyond these patterns awaits a real adapter.
- Worktree includes prior uncommitted weekly-progress and goal-allocation changes; those changes were preserved.

## Recommended Next Step

- Continue the goal-allocation follow-up: represent a goal change to an already-recorded entry as a new immutable linked record, with a tool and approval path that preserve the original entry.
