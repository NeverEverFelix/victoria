# Session: Scope Allocation Choices and Remember Confirmed Patterns

- Date: 2026-10-23
- Time: 16:35 EDT
- Status: Completed
- Scope: Prevent a one-expense monthly/annual choice from being stored as a permanent preference and remember confirmed behavior semantically.

## Outcome

Allocation horizon choices are treated as context for the current covered recurring expense. After explicit confirmation creates a mocked savings entry, Victoria can retain an observed pattern and recall it as a soft cue in similar future decisions.

## Work Completed

- Added coverage in [preference-memory.test.ts](../../tests/unit/agent/preference-memory.test.ts) for a natural-language horizon prompt and answer, no memory on the unconfirmed choice, and semantic memory only after confirmation.
- Generalized horizon prompt and answer recognition in [victoria-agent.ts](../../src/agent/victoria-agent.ts) so the conversation linkage is based on an explicit question comparing monthly and annual/yearly horizons and an unambiguous user answer.
- Stored the observed behavior with the expense summary and user choice as evidence; kept it separate from durable preference memories and surfaced prior behavior as context for future similar decisions.
- Updated specialist guidance and the product contract in [openai-specialists.ts](../../src/agent/team/openai-specialists.ts), [openai-personalized-reply.ts](../../src/agent/memory/openai-personalized-reply.ts), [mvp.md](../mvp.md), [user-stories.md](../user-stories.md), [test-plan.md](../../tests/test-plan.md), and [user-learning-schema.md](../specification/user-learning-schema.md).

## Decisions

- A horizon choice for a specific expense is not a standing preference.
- Only a confirmed mocked savings action contributes an observation to the covered-recurring-expense behavior pattern.
- One observation may be recalled as an example; describing a tendency requires multiple observations. This decision is documented in [decisions.md](../decisions.md).

## Verification

- `npx vitest run tests/unit/agent/preference-memory.test.ts -t "keeps a monthly allocation choice scoped"` — passed.
- `npm run typecheck` — passed.
- `npm run check` — passed: 65 test files, 563 tests passed; 7 files skipped, 15 tests skipped, 9 todo.
- `git diff --check` — passed.
- Existing lint warnings remain for `answerToRecentQuestion` in `src/agent/victoria-agent.ts` and `_observedThrough` in `tests/unit/agent/memory-orchestrator.test.ts`.

## Unresolved

- Memory retrieval and phrasing remain subject to the configured provider behavior; no hosted conversation was run in this session.
- The repository already had numerous unrelated modified and untracked files. They were left intact.

## Recommended Next Step

Review a fresh multi-turn conversation to confirm Victoria recalls the behavior gently without treating it as a default choice for a different expense.
