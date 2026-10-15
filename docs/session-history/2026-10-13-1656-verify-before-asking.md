# Session: Verify Before Asking For Merchant Spend

- Date: 2026-10-13
- Time: 16:56 America/New_York
- Status: Completed
- Scope: Ensure a remembered merchant routine triggers a user question only when transaction history cannot verify a typical cost.

## Outcome

When a merchant routine exists but no spend amount is remembered, Victoria still checks the available transaction-history provider. A valid result produces an estimate without asking for an amount; missing, failed, or invalid evidence falls back to a contextual user question.

## Work Completed

- Added an end-to-end test in [preference-memory.test.ts](../../tests/unit/agent/preference-memory.test.ts) showing a DoorDash routine plus a valid user-scoped transaction estimate yields a suggestion and no amount question.
- Clarified the fallback rule in Story 2, the test plan, MVP memory boundary, and safety contract rule MEM-007.
- Confirmed existing code performs transaction-history selection when spend memory and tool estimate are absent; this slice locks the behavior with regression coverage.

## Decisions

- Ask for the cost only when no remembered spend amount or usable transaction estimate can verify one.
- Merchant routine memory may personalize the fallback question, but it is never used as a monetary estimate.

## Verification

- Targeted `preference-memory.test.ts` passed: 22 tests.
- `npm run check` passed: agent validation, lint, source and test type checks; 35 test files passed, 6 skipped; 354 tests passed, 4 skipped, 9 todo.
- Existing Node experimental SQLite warnings remain.

## Unresolved

- No live transaction-history adapter exists. The verified provider behavior remains exercised through a fake provider.
- The worktree contains earlier slice changes; they were not altered here.

## Recommended Next Step

Keep the ask-only-as-fallback behavior and add real provider integration only after the documented product and safety review; continue testing unavailable, stale, and malformed provider results as clarification paths.
