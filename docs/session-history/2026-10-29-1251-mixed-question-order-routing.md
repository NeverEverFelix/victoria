# Session: Mixed Question Order Routing

- Date: 2026-10-29
- Time: 12:51 EDT
- Status: Completed
- Scope: Continue F1 mixed-intent coverage and move the trusted large-diff review collector onto PR #19's actual base branch.

## Outcome

Mixed-turn extraction now considers every clearly separated clause, so an ordinary question can precede an avoided-spend statement. PR #21 promoted the trusted reviewer collector to `main`, and PR #19 was updated to the new base while preserving its stricter base-SHA guard.

## Work Completed

- Added helper coverage for an ordinary question before the financial clause, with action and finance clauses excluded from conversational extraction; see [conversation-routing.ts](../../src/agent/conversation-routing.ts) and [conversation-routing.test.ts](../../tests/unit/agent/conversation-routing.test.ts).
- Added an agent regression confirming the companion voice can answer the first question and ask one confirmation-gated savings action; see [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts).
- Updated F1/F11 notes in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md) and [test-plan.md](../../tests/test-plan.md).
- Merged [PR #21](https://github.com/NeverEverFelix/victoria/pull/21) to `main`; merged that base update into `feature/victoria-agent-core` and pushed it to PR #19.
- Raised the repository variable `AI_REVIEW_MAX_CHUNKS` to 192 because PR #19's complete diff requires 164 passes.

## Decisions

- An explicit current-turn amount/action stays on the guarded financial route. Extracted ordinary questions are read-only and do not grant approval.
- AI review findings remain pending a valid repository OpenAI API key; no review finding was generated during this session.

## Verification

- `npm run check` passed: 89 files passed, 9 skipped; 845 tests passed, 25 skipped, 9 todo.
- PR #21's exact-head GitHub `Check` passed before merge. Its AI job reached OpenAI after successful diff collection, then failed with `401` because the key was invalidated.
- PR #19's code checks passed on the base-refresh head before the current mixed-question-order changes.
- Existing lint warning: `_observedThrough` in `memory-orchestrator.test.ts`; Node emitted experimental SQLite warnings.

## Unresolved

- The current PR #19 head requires exact-head CI after this session's changes.
- PR #19's complete AI review still requires repository key renewal.
- 198 untracked conflict-copy files from the branch-switch environment remain untouched and unstaged.

## Recommended Next Step

- Push the mixed-question-order change, verify exact-head CI, renew the API key, rerun PR #19's AI review, and address any actionable findings.
