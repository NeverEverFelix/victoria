# Session: Focused career fallback

- Date: 2026-10-27
- Time: 18:20 America/New_York
- Status: Partial
- Scope: Improve one read-only fallback case identified by finding F5 in the conversational-core review.

## Outcome

If conversational generation fails on a job-change question, Victoria now offers a focused prompt about the user's decision criteria when no pending workflow or validated financial context is present.

## Work Completed

- Added a deterministic career-choice fallback that introduces no amounts, savings proposal, or ledger claim.
- Added a regression test verifying the focused response and absence of proposal/ledger side effects.
- Updated the [review](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md) and [test plan](../test-plan.md).

## Decisions

- The fallback is limited to read-only turns without pending workflow, typed financial facts, or historical event context; those continue using their existing baseline.
- F5 remains partial because fallback coverage is topic-specific and has not been measured across broader conversational intents.

## Verification

- `npm run test -- tests/unit/agent/victoria-agent.test.ts` — passed (147 tests).
- `npm run check` — passed: 84 files passed, 9 skipped; 785 tests passed, 25 skipped, 9 todo.
- `git diff --check` — passed.
- Existing lint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:146` for unused `_observedThrough`.

## Unresolved

- Other review findings remain partial or open, as shown in the review's resolution matrix.
- Existing dirty-worktree changes were preserved and not reset or reverted.

## Recommended Next Step

- Continue with another specific conversational fallback scenario only when its deterministic question can stay grounded and safe; otherwise prioritize F1 routing or F6 pending-workflow separation.
