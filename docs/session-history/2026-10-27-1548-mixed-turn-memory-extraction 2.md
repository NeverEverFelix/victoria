# Session: Mixed-turn memory extraction

- Date: 2026-10-27
- Time: 15:48 America/New_York
- Status: Partial
- Scope: Address the F7 mixed-content memory extraction gap documented in the conversational core deep dive.

## Outcome

Validated provider extraction can now capture a distinct stable fact from an eligible turn even when deterministic extraction already captured another fact.

## Work Completed

- Removed the deterministic-extraction suppression on the eligible provider memory path in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Exact provider repeats are skipped; changed facts supersede the most recent record for the same category and key.
- Added a mixed-fact regression case in [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts).
- Updated expected coverage in [test-plan.md](../../tests/test-plan.md) and progress notes in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- Preserve the existing evidence, confidence, stability, and sensitivity validation for provider candidates.
- Preserve pending action, correction, and goal-action exclusions from this provider path.
- This is an in-process extraction improvement; durable post-turn job processing remains a proposal in F7.

## Verification

- Focused regression and pending-action memory tests passed.
- `npm run check` passed: 84 test files passed, 9 skipped; 754 tests passed, 24 skipped, 9 todo.
- `git diff --check` passed before the full check.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted existing experimental SQLite warnings.

## Unresolved

- F7's broader post-turn durable job/transaction boundary, retention controls, and correction/forget ordering remain open.
- The worktree contains other in-progress changes from earlier sessions; this entry only describes the F7 slice above.

## Recommended Next Step

- Review the remaining F7 proposal against the current persistent turn-processing architecture before introducing any durable memory-extraction queue.
