# Session: Merchant Spend Language Variant

- Date: 2026-10-13
- Time: 16:41 America/New_York
- Status: Completed
- Scope: Extend conversational memory with one common direct phrasing for typical merchant spend.

## Outcome

Victoria now recognizes “My usual spend at [merchant] is around [amount]” as an explicit recurring merchant spend. It stores the statement as user-scoped memory and may use it in a later same-merchant estimate.

## Work Completed

- Extended `extractMerchantSpendClaim` in [extract-preference.ts](../../src/agent/memory/extract-preference.ts) to parse the amount-after-merchant phrasing with `usual` or `typical` and an explicit `is`, `runs`, or `costs` relation.
- Added an agent-level memory-to-later-estimate test in [preference-memory.test.ts](../../tests/unit/agent/preference-memory.test.ts).
- Updated the conversational-memory queue, Story 12, and test plan.

## Decisions

- This slice adds one narrow recurring-spend pattern. It does not infer typical spend from a one-time amount, and broader language coverage remains open.
- The resulting estimate remains an estimate and requires normal approval before any ledger entry.

## Verification

- TDD confirmed the new behavior failed before implementation and passed after the parser change.
- `npm run check` passed: agent validation, lint, source and test type checks; 35 test files passed, 6 skipped; 351 tests passed, 4 skipped, 9 todo.
- Existing Node experimental SQLite warnings remain.

## Unresolved

- Broader language coverage for other ways of stating habits, preferences, and goals remains open.
- The worktree contains other changes from earlier slices; they were not altered here.

## Recommended Next Step

Add one additional narrow language variant from a supported recurring-habit or savings-goal story, with tests that reject tentative or one-time statements.
