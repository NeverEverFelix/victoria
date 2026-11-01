# Session: Extract restored planning-choice policy

- Date: 2026-10-28
- Time: 14:15 EDT
- Status: Completed
- Scope: Extract recovery of a monthly/annual planning choice from pending-event dialogue into a tested pure policy.

## Outcome

Restored pending savings proposals can recover a previously selected planning horizon from conversation history through a standalone dialogue policy. The policy returns a new decision only when the source event summary is unique and a valid choice follows the planning prompt. Persistence and approval remain owned by `VictoriaAgent`.

## Work Completed

- Added `recoverPendingPlanningHorizon` to [conversation-dialogue-policy.ts](../../src/agent/conversation-dialogue-policy.ts) and wired it into [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added direct policy tests for recovery, duplicate-event rejection, and preserving an existing choice in [conversation-dialogue-policy.test.ts](../../tests/unit/agent/conversation-dialogue-policy.test.ts).
- Updated finding F10 in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- Planning-choice recovery remains read-only policy; the caller persists a changed pending decision.
- Ambiguous event provenance does not restore a choice.

## Verification

- Focused dialogue-policy and agent tests passed: 166 tests.
- `npm run check` passed: 89 test files passed, 9 skipped; 835 tests passed, 25 skipped, 9 todo.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts`; Node emits experimental SQLite warnings.

## Unresolved

- F10 remains open because pending-state persistence and broader turn orchestration still live in `VictoriaAgent`.
- The checkout contained substantial uncommitted conversational-core implementation and session history from the ongoing work. The user requested this accumulated work be committed and pushed; preserve its scope.

## Recommended Next Step

- Continue with one self-contained conversational review finding at a time; before future pushes, run the full check and inspect the working tree.
