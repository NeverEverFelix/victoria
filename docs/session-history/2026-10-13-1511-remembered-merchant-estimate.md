# Session: Use remembered merchant spend for avoided-spend estimates

- Date: 2026-10-13
- Time: 15:11 America/New_York
- Status: Completed
- Scope: Implement the smallest vertical slice connecting an explicit quantified merchant habit to a later avoided-spend estimate.

## Outcome

Victoria can remember a direct statement such as “I usually spend $6 at Blue Bottle for coffee” and use that amount in a later avoided-spend estimate for the same merchant and user. The suggestion remains an estimate, still requires explicit approval, and does not create a ledger entry on its own.

## Work Completed

- Added narrow extraction for explicit USD spend plus an exact merchant, stored as an evidence-backed habit fact.
- Looked up the latest matching user-scoped merchant fact during estimation and passed it as a fallback estimate. Existing user-provided amounts and established merchant habits retain priority.
- Added a vertical behavior test, including a cross-user isolation check.
- Updated [Story 2](../user-stories.md), [the test plan](../../tests/test-plan.md), [the safety contract](../specification/mvp-safety-contract.md), and [the work queue](../agent-work-queue.md).

## Decisions

- Confirmed for this slice: only the same normalized exact merchant match can use this remembered amount; other user memories do not contribute.
- Confirmed: remembering an amount is not approval to record savings, and the current approval-gated mocked-ledger behavior remains in force.
- Goal memories remain informational and are not automatically attached to savings entries.

## Verification

- Targeted memory tests passed.
- `npm run check` passed: 33 test files passed, 6 skipped; 335 tests passed, 4 skipped, 9 todo.
- `git diff --check` passed.
- Existing Node experimental SQLite warnings appeared during checks.

## Unresolved

- The extractor intentionally supports a small set of direct “usually/often/typically/regularly spend $X at/on merchant” phrasings. Broader language handling remains open.
- Live PostgreSQL verification and production memory wiring remain pending.
- Remembered goals remain unconnected to destination suggestions or allocations.

## Recommended Next Step

Add another narrow language variant for explicit merchant spend and exercise it through the same estimate flow, or separately define safe goal-memory use before proposing any goal destination.
