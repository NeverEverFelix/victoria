# Session: Expand the memory personalization context cap

- Date: 2026-10-16
- Time: 11:40 EDT
- Status: Completed
- Scope: Respond to feedback that two recalled details were too limiting for ordinary personalized reflections.

## Outcome

Ordinary reflection synthesis can now include up to four relevant memories, covering a matching routine, goal, preference, and fresh episode. The selected details remain topic-matched and do not affect financial decisions.

## Work Completed

- Raised the synthesis cap in [victoria-agent.ts](../../src/agent/victoria-agent.ts) from two to four relevant context details.
- Expanded the regression in [preference-memory.test.ts](../../tests/unit/agent/preference-memory.test.ts) to include four relevant memories and an unrelated reminder preference.
- Updated the behavior contract in [user-stories.md](../user-stories.md), [test-plan.md](../../tests/test-plan.md), and [mvp.md](../mvp.md).

## Decisions

- Confirmed by user feedback: two remembered details are insufficient for this experience. This slice uses a bounded four-detail cap to allow richer synthesis while keeping the response focused.
- Unrelated memories remain excluded; memory is not approval and does not alter financial action policy.

## Verification

- `npm run check` passed: agent validation, lint, both TypeScript checks, and all configured tests (472 passed, 4 skipped, 9 todo; 6 test files skipped).
- Existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts:95`; Node reports the experimental SQLite warning.

## Unresolved

- The four-detail cap is an implementation bound, not a calibrated conversational-quality threshold. A future evaluation should assess when combining multiple details feels useful versus crowded.
- The worktree already contained unrelated memory and persistence changes; they were left untouched.

## Recommended Next Step

- Add response-quality cases for several relevant memory combinations and verify that contradictory or corrected facts are not combined with their superseded versions.
