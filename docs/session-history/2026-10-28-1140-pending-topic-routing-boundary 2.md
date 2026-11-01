# Session: Extract Pending Savings Topic-Switch Policy

- Date: 2026-10-28
- Time: 11:40 America/New_York
- Status: Completed
- Scope: Move pending-proposal read-only topic-switch eligibility into the conversation-routing policy module.

## Outcome

The savings workflow branch now delegates its read-only topic-switch eligibility decision to a named pure routing helper. Existing topic-shift behavior is preserved while recording, correction, and amount-change requests remain on guarded paths.

## Work Completed

- Added `isSafePendingSavingsTopicSwitch` in [conversation-routing.ts](../../src/agent/conversation-routing.ts).
- Replaced the inline eligibility condition in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added direct routing coverage in [conversation-routing.test.ts](../../tests/unit/agent/conversation-routing.test.ts).
- Updated F10 progress in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- The helper only decides whether read-only conversation may pass a pending savings proposal. It does not approve, decline, revise, or mutate pending state.
- F10 remains open because pending workflow state and broader route orchestration still live in `VictoriaAgent`.

## Verification

- Focused tests: 6 passed, 150 skipped.
- `npm run check`: passed; 86 test files passed, 9 skipped; 799 tests passed, 25 skipped, 9 todo.
- `git diff --check`: passed.
- Existing lint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:146` for `_observedThrough` being unused.

## Unresolved

- Broader conversation routing and pending-action state are still interwoven with the agent orchestrator.
- The worktree contains extensive unrelated uncommitted work and was preserved.

## Recommended Next Step

Continue F10 with a small, direct-testable clarification or dialogue policy boundary, keeping approval and mutation logic deterministic.
