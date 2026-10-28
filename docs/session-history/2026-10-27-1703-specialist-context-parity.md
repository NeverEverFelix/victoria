# Session: Align specialist context selection with responder context

- Date: 2026-10-27
- Time: 17:03 America/New_York
- Status: Partial
- Scope: Close a context-selection mismatch in F2 specialist snapshots.

## Outcome

Specialist snapshots now reuse the responder's provenance-eligible memory selection and carry its relevant episode summaries and response-depth preference. A pending savings action is labeled in the snapshot when applicable. Nested financial and event context is detached and frozen so the snapshot cannot drift after construction.

## Work Completed

- Updated `classifyWithTeam` to build from `conversationResponderMemories` and receive episode/preference/action-label metadata in [`victoria-agent.ts`](../../src/agent/victoria-agent.ts).
- Added a regression proving specialist and responder snapshots agree on eligible selected memories and provenance in [`victoria-agent.test.ts`](../../tests/unit/agent/victoria-agent.test.ts).
- Added nested-copy/freeze regression coverage in [`conversation-responder.test.ts`](../../tests/unit/agent/conversation-responder.test.ts).
- Added branch-parity coverage confirming eligible episodic summaries are shared with Financial Moment and remain separate from selected facts in [`victoria-agent.test.ts`](../../tests/unit/agent/victoria-agent.test.ts).
- Recorded the remaining F2 gap in [`VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md`](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- Specialists use the responder's existing provenance-aware memory projection; raw retrieved memories are not passed through this snapshot path.
- No product boundary or approval behavior changed.

## Verification

- `npx vitest run tests/unit/agent/victoria-agent.test.ts` passed: 133 tests.
- `npx vitest run tests/unit/agent/conversation-responder.test.ts tests/unit/agent/victoria-agent.test.ts` passed: 154 tests.
- `npm run typecheck` and `npm run typecheck:test` passed.
- `npm run check` passed: 84 test files passed (9 skipped); 767 tests passed, 25 skipped, 9 todo.
- `git diff --check` passed.

## Unresolved

- F2 remains partial; broader branch parity and reconciliation with target-state identity/dialogue fields remain open.
- The worktree has extensive pre-existing uncommitted changes; preserve them.

## Recommended Next Step

- Continue auditing branch parity for the remaining snapshot fields, then choose the next open review finding from the deep-dive matrix.
