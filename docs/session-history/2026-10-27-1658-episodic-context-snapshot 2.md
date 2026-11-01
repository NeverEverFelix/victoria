# Session: Episodic context in responder snapshot

- Date: 2026-10-27
- Time: 16:58 America/New_York
- Status: Partial
- Scope: Include relevant, lifecycle-filtered episode summaries in the immutable read-only responder context.

## Outcome

The read-only responder snapshot now carries relevant episodic summaries separately from selected user-stated facts and validated financial facts. Episode selection retains the current age, confidence, topical relevance, and lifecycle suppression checks.

## Work Completed

- Added a separate `episodicSummaries` field to the snapshot and provider prompt in [conversation-responder.ts](../../src/agent/conversation-responder.ts).
- Applied current lifecycle suppression and selected only usable, relevant episode summaries in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added snapshot assertions in [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts) and verified corrected episodes stay out in [episodic-memory.test.ts](../../tests/unit/agent/episodic-memory.test.ts).
- Updated F2 implementation notes in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md) and [test-plan.md](../../tests/test-plan.md).

## Decisions

- Episode summaries remain separate historical context; they are not current user facts, financial evidence, approval, or proof of a recorded outcome.
- Only relevant summaries surviving existing age, confidence, topic, and correction/forget lifecycle checks are sent to the responder.

## Verification

- Focused agent, episode, and responder suites passed: 162 tests.
- `npm run check` passed: 84 test files passed, 9 skipped; 766 tests passed, 25 skipped, 9 todo.
- The existing lint warning remains for `_observedThrough` in `tests/unit/agent/memory-orchestrator.test.ts`. Node emitted experimental SQLite warnings.
- `git diff --check` passed.

## Unresolved

- F2 remains partial because the shared snapshot contract does not yet reach every specialist path.
- The PostgreSQL lifecycle integration remains guarded and was not executed in this environment.
- The worktree contains other in-progress changes from earlier sessions; this entry describes only episodic snapshot context.

## Recommended Next Step

- Extend the same canonical context contract to specialist requests, then continue with the broader F1 intent-routing work.
