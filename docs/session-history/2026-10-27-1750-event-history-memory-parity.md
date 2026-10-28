# Session: Verify memory parity on event-history replies

- Date: 2026-10-27
- Time: 17:50 America/New_York
- Status: Completed
- Scope: Verify episodic and sourced-memory selection remains consistent on read-only event-history responder turns.

## Outcome

Event-history responder snapshots preserve a relevant episode separately from selected memories and include a current user correction with its provenance while excluding the superseded version.

## Work Completed

- Extended the pending event-history route test in [`victoria-agent.test.ts`](../../tests/unit/agent/victoria-agent.test.ts) with an eligible episodic summary and superseded/corrected preference pair.
- Asserted the bounded event list remains identical across explicit responder fields and snapshot, episode summaries remain separate, and selected memory provenance is `user_correction`.
- Updated F2 notes in [`VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md`](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md) and test expectations in [`test-plan.md`](../tests/test-plan.md).

## Decisions

- Event-history responses follow the same episode eligibility, memory lifecycle, and provenance rules as other read-only responder paths.
- No product boundary changed.

## Verification

- Focused Victoria agent suite passed: 141 tests.
- `npm run check` passed: 84 test files passed, 9 skipped; 776 tests passed, 25 skipped, 9 todo.
- Existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` (`_observedThrough` unused).

## Unresolved

- F2 remains partial. Broader workflow/reference parity across all routes and dialogue-state design remain open.
- The worktree contains extensive pre-existing uncommitted changes; preserve them.

## Recommended Next Step

- Continue checking workflow and event context isolation across user and conversation boundaries on responder routes.
