# Session: Merchant-Specific Habit Memory

- Date: 2026-10-13
- Time: 16:44 America/New_York
- Status: Completed
- Scope: Store recurring habits tied to named merchants independently from generic category routines and other merchants.

## Outcome

Clear recurring activity statements that name a merchant are now stored using a merchant-specific memory key. Newer statements append linked records for the same merchant without replacing other merchants' habits. Generic routines and tentative statements retain their existing behavior.

## Work Completed

- Added extraction of merchant names introduced by `at`, `from`, `through`, or `via` in explicit recurring habit statements, and added `merchantHabitMemoryKey` in [extract-preference.ts](../../src/agent/memory/extract-preference.ts).
- Added tests for DoorDash and Blue Bottle habits, superseding an updated DoorDash routine, preserving the generic coffee routine, and ignoring tentative statements in [preference-memory.test.ts](../../tests/unit/agent/preference-memory.test.ts).
- Updated the MVP memory boundary, Story 12, work queue, and test plan.

## Decisions

- A merchant routine records evidence about recurring behavior; it does not itself provide a typical spend amount or create a savings estimate.
- Existing generic location patterns such as coffee at home continue to use generic category habit keys.

## Verification

- TDD confirmed merchant-specific behavior failed before implementation and passed after the extractor change.
- `npm run check` passed: agent validation, lint, source and test type checks; 35 test files passed, 6 skipped; 352 tests passed, 4 skipped, 9 todo.
- Existing Node experimental SQLite warnings remain.

## Unresolved

- Merchant extraction remains intentionally phrase-based. Ambiguous locations and broader language variants need their own tests before support.
- The worktree contains changes from earlier slices; they were not altered as part of this work.

## Recommended Next Step

Add a narrow retrieval behavior only if product needs merchant routines (without spend amounts) to shape a future clarification; do not treat routine frequency as a monetary estimate.
