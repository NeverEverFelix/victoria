# Session: Pending budget topic routing

- Date: 2026-10-27
- Time: 16:40 America/New_York
- Status: Partial
- Scope: Let clear read-only budget topic switches pass an unrelated pending savings workflow.

## Outcome

An explicit “let's talk about my budget instead” turn now reaches the conversational responder while a savings proposal is pending. The topic switch does not revise or approve the proposal; a later explicit confirmation still records the original amount.

## Work Completed

- Added `isExplicitReadOnlyTopicSwitch` in [conversation-routing.ts](../../src/agent/conversation-routing.ts) and used it to refine the pending savings workflow guard in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added a regression in [conversation-responder.test.ts](../../tests/unit/agent/conversation-responder.test.ts) covering the topic switch, no-write behavior, and later approval.
- Updated F1/F6 notes in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md) and [test-plan.md](../../tests/test-plan.md).

## Decisions

- Explicit talk/discuss/think-about phrasing may bypass a finance-word-based topic-switch block only when it contains no direct action or ledger command.
- This is a targeted routing correction, not completion of the first-class intent router or pending-workflow separation.

## Verification

- Focused topic-switch regression passed.
- `npm run check` passed: 84 test files passed, 9 skipped; 765 tests passed, 25 skipped, 9 todo.
- The existing lint warning remains for `_observedThrough` in `tests/unit/agent/memory-orchestrator.test.ts`. Node emitted experimental SQLite warnings.
- `git diff --check` passed.

## Unresolved

- F1 and F6 remain partial; intent classification and workflow/dialogue separation need broader work.
- The worktree contains other in-progress changes from earlier sessions; this entry describes only this routing slice.

## Recommended Next Step

- Continue reviewing high-priority F1 cases involving indirect financial conversation and mixed intents, while retaining the pending-action approval regressions.
