# Session: Conversation context snapshot contract

- Date: 2026-10-27
- Time: 16:55 America/New_York
- Status: Partial
- Scope: Bundle read-only responder context in one immutable snapshot and build it uniformly before generation.

## Outcome

Every read-only provider call now receives a `ConversationContextSnapshot` containing the current message, recent turns, selected memories, typed financial/workflow context, explicitly allowed event history, pending-action label, response depth, and baseline. The OpenAI responder consumes the bundled snapshot, and repair attempts rebuild it when their baseline changes.

## Work Completed

- Added the snapshot contract and builder in [conversation-responder.ts](../../src/agent/conversation-responder.ts).
- Centralized snapshot construction and repair-snapshot rebuilding in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Updated provider payload tests and added assertions that the agent supplies canonical selected memories and financial context in one snapshot in [conversation-responder.test.ts](../../tests/unit/agent/conversation-responder.test.ts) and [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts).
- Updated F2 status notes in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md) and [test-plan.md](../../tests/test-plan.md).

## Decisions

- The provider receives the canonical context as one object instead of parallel top-level copies.
- Event history remains absent unless explicitly resolved for an event-history request.
- F2 remains partial because episodic retrieval and a shared snapshot across all specialist calls are not included yet.

## Verification

- Focused responder and agent suites passed: 152 tests.
- `npm run check` passed: 84 test files passed, 9 skipped; 765 tests passed, 25 skipped, 9 todo.
- The existing lint warning remains for `_observedThrough` in `tests/unit/agent/memory-orchestrator.test.ts`. Node emitted experimental SQLite warnings.
- `git diff --check` passed.

## Unresolved

- The PostgreSQL episode lifecycle integration remains guarded and was not run in this environment.
- The worktree contains other in-progress changes from earlier sessions; this entry describes only the snapshot contract increment.

## Recommended Next Step

- Add relevant episodic retrieval to the snapshot under existing lifecycle and provenance filters, then assess whether the same canonical snapshot can be passed to the remaining read-only specialist paths.
