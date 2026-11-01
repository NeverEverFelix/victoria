# Session: Recurring projection with record request

- Date: 2026-10-27
- Time: 18:26 America/New_York
- Status: Partial
- Scope: Handle a combined annual-projection question and request to record the current month during an active recurring-cost proposal.

## Outcome

When the user asks for annual math and requests a current-month entry in the same turn, Victoria now gives the conditional annual projection, names the exact pending monthly amount, and asks for explicit confirmation. Only a later confirmation records the current monthly amount.

## Work Completed

- Added a regression reproducing the old behavior, where the agent answered only the math and dropped the record request.
- Added a deterministic response for the grounded single-event case with an active pending proposal; it preserves the pending proposal and confirms no real money moves.
- Updated Story 1, the [test plan](../test-plan.md), and the [deep-dive review](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).
- Kept existing dirty-worktree changes intact.

## Decisions

- The annual figure stays a conditional projection. The requested mocked-ledger action remains the exact pending monthly amount and requires a separate “yes.”
- This covers one mixed-intent shape; general multi-intent composition remains unresolved under F1.

## Verification

- Regression passed after confirming it failed against the previous behavior.
- `npm run check` passed: 84 files passed, 9 skipped; 789 tests passed, 25 skipped, 9 todo.
- `git diff --check` passed.
- Existing lint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:146` for unused `_observedThrough`.

## Unresolved

- The mixed turn is handled with a bounded deterministic template for one event and current-month request; broader combinations and response-quality evaluation remain open.
- Other findings in the review remain partial or open.

## Recommended Next Step

- Add coverage for a combined annual projection and record request when multiple recurring costs are in context; require the user to identify which monthly amount to record before creating a proposal.
