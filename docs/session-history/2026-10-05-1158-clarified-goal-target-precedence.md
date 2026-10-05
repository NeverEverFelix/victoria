# Session: Clarified Goal Target Precedence

- Date: 2026-10-05
- Time: 11:58 EDT
- Status: Completed
- Scope: Continue the headless multi-agent gap audit around correction and goal-allocation targets.

## Outcome

Found and fixed a mock-classifier gap where only “Emergency fund” was recognized, and stale unresolved context could override a newly clarified goal name. The current message now takes precedence when it names the goal.

## Work Completed

- Added goal-name extraction for goal-specific target wording and standalone names such as “Travel fund.” See [mock classifier](../../src/agent/llm/mock-llm.ts).
- Added a multi-turn evaluation confirming a low-confidence Emergency Fund request can be clarified as Travel Fund, which is proposed and recorded only after explicit approval. See [conversation evaluations](../../tests/evaluation/multi-agent-conversations.test.ts).
- Updated evaluation and test-plan descriptions to cover clarified-target precedence.

## Decisions

- A clarified target in the current user message takes precedence over any target named in retained clarification context.
- Allocation remains approval-gated. This change extracts user-provided target names; it does not add real goal storage or money movement.

## Verification

- Focused agent and conversation tests passed (89 tests).
- `npm run check` passed: 23 test files passed, 1 skipped; 233 tests passed, 1 todo.
- `git diff --check` passed.

## Unresolved

- The mock goal-name parser supports explicit “toward” and goal-specific wording, but it is not a general language model and does not validate goal names against a persisted goal catalog.
- Correction-target and pending-action state remain limited to in-process conversation context.
- The worktree contains broader existing changes outside this slice.

## Recommended Next Step

Review corrections across multiple saved entries and unclear correction targets. Ensure Victoria asks the user to choose an entry when “that” could refer to more than one recorded item, and that a follow-up amount cannot silently select a different entry.
