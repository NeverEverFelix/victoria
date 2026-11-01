# Session: Pending Proposal Topic Switch

- Date: 2026-10-27
- Time: 15:46 America/New_York
- Status: Completed
- Scope: Verify the F6 promotion-and-budget topic-switch example while a savings proposal awaits confirmation.

## Outcome

Added exact regression coverage showing the read-only topic switch reaches the conversation responder while a $35 proposal is pending, does not record or replace the proposal, and preserves the later explicit approval path for that exact amount. No routing code change was needed for this scenario.

## Work Completed

- Added the exact promotion/budget scenario to [`tests/unit/agent/victoria-agent.test.ts`](../../tests/unit/agent/victoria-agent.test.ts).
- Updated F6 in [`docs/VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md`](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md) and added the case to [`tests/test-plan.md`](../test-plan.md).

## Decisions

- Record the narrow acceptance result without treating it as proof that all pending-action topic switches are correct.
- Keep the proposal and approval path unchanged; the test validates the existing deterministic boundary.

## Verification

- Focused Vitest case — passed.
- `npm run check` — passed (84 test files passed, 9 skipped; 753 tests passed, 24 skipped, 9 todo).
- Existing `_observedThrough` lint warning and experimental SQLite test warnings remain.
- `git diff --check` — passed.

## Unresolved

- Pending-action routing remains interwoven in `VictoriaAgent`; broader separation into dialogue state and explicit versioned action resolution remains open.
- The combined worktree includes prior conversational-core, provenance, and queued-turn changes and remains uncommitted.

## Recommended Next Step

Continue with F7's memory-learning eligibility across mixed-intent and pending-action turns, using the privacy and evidence contract before changing extraction triggers.
