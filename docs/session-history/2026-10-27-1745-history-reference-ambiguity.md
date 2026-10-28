# Session: Handle ambiguous history references without a pending proposal

- Date: 2026-10-27
- Time: 17:45 America/New_York
- Status: Completed
- Scope: Close an uncovered event-history route and verify event projections reach the responder snapshot consistently.

## Outcome

Ambiguous and unmatched historical-event references now receive deterministic conversation-scoped responses even when no proposal is pending. Qualified event-history replies carry the same bounded event list in the explicit responder field and immutable snapshot.

## Work Completed

- Added deterministic ambiguous/not-found handling in [`victoria-agent.ts`](../../src/agent/victoria-agent.ts) before model generation for the no-pending route.
- Added route regressions in [`victoria-agent.test.ts`](../../tests/unit/agent/victoria-agent.test.ts) for duplicate merchant matches, unmatched event descriptions, and exact event-list parity on a pending history response.
- Updated [`test-plan.md`](../tests/test-plan.md) and the F2 notes in [`VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md`](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- Historical event ambiguity is resolved before response generation and cannot become an approval, correction, or ledger action.
- No product boundary changed.

## Verification

- Focused Victoria agent suite passed: 140 tests.
- `npm run check` passed: 84 test files passed, 9 skipped; 775 tests passed, 25 skipped, 9 todo.
- Existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` (`_observedThrough` unused).

## Unresolved

- F2 remains partial. Broader cross-route event and proposal reference parity still needs review.
- The worktree contains extensive pre-existing uncommitted changes; preserve them.

## Recommended Next Step

- Review event-history question classification boundaries and test that mixed action/history requests do not receive historical event context on either pending or non-pending routes.
