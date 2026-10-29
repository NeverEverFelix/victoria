# Session: Preserve planning references in read-only snapshots

- Date: 2026-10-27
- Time: 17:28 America/New_York
- Status: Completed
- Scope: Add F2 coverage that a read-only topic switch retains a selected annual target and its distinct monthly recordable amount.

## Outcome

A read-only responder snapshot now has explicit regression coverage for the active proposal identity and selected planning horizon. The annual amount remains conditional context; the pending recordable amount remains monthly and requires explicit approval.

## Work Completed

- Added a covered-gym scenario in [`victoria-agent.test.ts`](../../tests/unit/agent/victoria-agent.test.ts): select the annual horizon, learn a hiking interest during a topic switch, inspect the responder workflow snapshot, and confirm only the monthly amount is recorded after “yes.”
- Added the corresponding criterion to [`test-plan.md`](../tests/test-plan.md) and implementation note to [`VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md`](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- The responder receives active proposal and planning state as read-only context. It cannot change the proposal or authorize recording.
- No product boundary changed.

## Verification

- Focused Victoria agent suite passed: 137 tests.
- `npm run check` passed: 84 test files passed, 9 skipped; 772 tests passed, 25 skipped, 9 todo.
- Existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` (`_observedThrough` unused).

## Unresolved

- F2 remains partial. Other workflow references and responder-route parity still need review.
- The worktree contains extensive pre-existing uncommitted changes; preserve them.

## Recommended Next Step

- Continue reviewing pending amount-clarification and proposal-revision snapshots to confirm they preserve the right reference state without exposing it as approval authority.
