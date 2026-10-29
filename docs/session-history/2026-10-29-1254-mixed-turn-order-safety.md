# Session: Mixed-Turn Order Safety

- Date: 2026-10-29
- Time: 12:54 EDT
- Status: Completed
- Scope: Verify read-only question extraction in both positions around a financial event, including the action-question exclusion.

## Outcome

An ordinary question preceding an avoided-spend statement is preserved for the response, while a question asking whether to record is never extracted as ordinary conversation. The financial suggestion remains approval-gated.

## Work Completed

- Added the preceding-question route and negative action-question case in [conversation-routing.test.ts](../../tests/unit/agent/conversation-routing.test.ts).
- Added agent coverage for the mixed turn with a question first and one pending savings confirmation in [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts).
- Updated the F1 record in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md) and the behavior contract in [test-plan.md](../../tests/test-plan.md).

## Decisions

- Routing remains heuristic; this increment does not close F1 or represent a new product decision.
- PR #19 remains open against `main`; PR #21's trusted-review collector fix has been merged into `main` and its merge incorporated into PR #19's branch.

## Verification

- `npm run check` passed: 89 files passed, 9 skipped; 845 tests passed, 25 skipped, 9 todo.
- Existing lint warning: `_observedThrough` in `memory-orchestrator.test.ts`; Node emitted experimental SQLite warnings.
- The trusted AI review collector now gathers PR #19's 164-pass diff. The model request failed with `401 token_invalidated`; no findings were generated.

## Unresolved

- Push this final test-plan/test assertion update and verify exact-head CI on PR #19.
- Renew the repository OpenAI key before requesting a current AI review.
- 198 untracked conflict-copy files remain untouched and unstaged.

## Recommended Next Step

- Push the final documentation/test update, confirm exact-head code checks, renew the AI review key, then review current findings before considering PR #19 for merge.
