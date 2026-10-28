# Session: Ground durable recurring spend amounts

- Date: 2026-10-27
- Time: 18:07 America/New_York
- Status: Partial
- Scope: Extend safe financial response grounding to one narrow class of durable user-stated recurring-spend memories.

## Outcome

Canonical conversation context now exposes a typed monthly amount and linked conditional annual projection when a retrieved, eligible user memory uses Victoria's explicit monthly recurring-spend format. The responder can use the derived figure only with conditional wording.

## Work Completed

- Added typed facts for current, high-confidence, explicitly sourced `financial_pattern` memories under `interest_spend:*` only when the value matches `Usually spends $N.NN per month on …`.
- Linked the projection to its source memory ID and monthly fact ID; marked it conditional on the spend being avoided for all twelve months.
- Added context-builder and response-validator regressions, including exclusion of an imported numeric profile, an unqualified projection, and an unsupported amount.
- Updated the [conversational review](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md) and [test plan](../test-plan.md).

## Decisions

- Numeric text in arbitrary memories does not become a financial fact. Only the known recurring-spend key/value shape, after the shared retrieval eligibility and ranking path, is admitted.
- The annual result remains a conditional projection, never realized or recorded savings.
- F4 remains partial; other durable numeric facts need explicit typed contracts before they can ground responses.

## Verification

- Focused context-builder and responder tests passed (35 tests).
- `npm run check` passed: 84 files passed, 9 skipped; 784 tests passed, 25 skipped, 9 todo.
- `git diff --check` passed.
- Existing lint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:146` for unused `_observedThrough`.

## Unresolved

- Existing in-progress changes remain in the worktree and were not reset or reverted.
- Review findings remain partial/open as recorded in the resolution matrix.

## Recommended Next Step

- Add typed contracts for any other durable financial amount sources only after their provenance, scope, and freshness requirements are explicit; then continue with a separate F1 or F5 conversational behavior gap.
