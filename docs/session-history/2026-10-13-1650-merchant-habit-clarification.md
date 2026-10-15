# Session: Merchant Habit Clarification

- Date: 2026-10-13
- Time: 16:50 America/New_York
- Status: Completed
- Scope: Use an exact merchant-specific routine to contextualize a missing-amount question and remember the user's separate cost answer.

## Outcome

When an avoided-spend event names a merchant with a remembered routine but no typical spend amount is available, Victoria references only that user's matching routine, asks for the cost, and stores a valid answer as a separate merchant-spend fact. A later event can use that user-provided amount. Routine frequency is not converted into money.

## Work Completed

- Added exact merchant-routine lookup and bounded clarification wording in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Extended [preference-memory.test.ts](../../tests/unit/agent/preference-memory.test.ts) to verify merchant-specific context, exclusion of unrelated merchant and generic habits, amount clarification, separate spend memory, future estimate reuse, and no pre-approval ledger write.
- Updated the MVP memory description, Story 2, test plan, and [mvp-safety-contract.md](../../docs/specification/mvp-safety-contract.md) with MEM-007.

## Decisions

- Merchant routine memory may personalize a missing-amount question only when the merchant key matches exactly for the same user.
- A routine does not supply a spend amount. Only the user's valid answer or another usable estimate source can do that; the resulting suggestion remains approval-gated.

## Verification

- TDD confirmed the contextual clarification failed before implementation and passed after.
- `npm run check` passed: agent validation, lint, source and test type checks; 35 test files passed, 6 skipped; 353 tests passed, 4 skipped, 9 todo.
- Existing Node experimental SQLite warnings remain.

## Unresolved

- The optional transaction-history provider still has no live adapter.
- Broader language variants for merchant routines remain open.
- The worktree contains changes from earlier slices; they were not altered here.

## Recommended Next Step

Add a narrow contract test showing that an ambiguous merchant reference cannot retrieve a different merchant's routine; keep savings estimates dependent on an amount source.
