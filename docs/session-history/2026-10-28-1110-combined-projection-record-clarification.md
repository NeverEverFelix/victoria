# Session: Clarify Recording Among Combined Recurring Costs

- Date: 2026-10-28
- Time: 11:10 America/New_York
- Status: Completed
- Scope: Handle mixed requests for combined recurring-cost projections and recording one of the underlying costs.

## Outcome

Victoria now answers the conditional combined projection and clarifies which single monthly cost the user means before creating or changing a savings proposal. An existing pending proposal remains pending; the combined projection is not recordable and no ledger entry is created by the ambiguous mixed request.

## Work Completed

- Added a regression for two declined recurring-cost suggestions followed by a combined projection plus “record one this month” request in [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts).
- Added deterministic clarification routing in [victoria-agent.ts](../../src/agent/victoria-agent.ts), including the pending-proposal path.
- Updated the MVP behavior, Story 24, test plan, and conversational review in [mvp.md](../mvp.md), [user-stories.md](../user-stories.md), [test-plan.md](../../tests/test-plan.md), and [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- When multiple recurring costs contribute to a projection and the user asks to record “one,” the agent must identify the single monthly source before creating or changing a proposal.
- This is a behavior clarification within the existing mocked-ledger boundary; it does not authorize real money movement.
- F1 remains partially addressed; broad first-class multi-intent routing remains open.

## Verification

- Focused tests: 2 passed, 150 skipped.
- `npm run check`: passed; 84 test files passed, 9 skipped; 791 tests passed, 25 skipped, 9 todo.
- `git diff --check`: passed.
- Existing lint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:146` for `_observedThrough` being unused.

## Unresolved

- The conversational deep dive still lists broader routing, context, memory, orchestration, and merge-readiness work as open or partial.
- The repository already contains extensive unrelated uncommitted work. It was preserved; this session did not attempt to reconcile or commit it.

## Recommended Next Step

Continue with one high-impact, testable F1 mixed-intent case from the conversational deep dive, then re-run `npm run check` and update the review's status evidence.
