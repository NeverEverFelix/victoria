# Session: Pending proposal revision gate extraction

- Date: 2026-10-30
- Time: 17:17 EDT
- Status: Partial
- Scope: Continue the F04 coordinator refactor by isolating exact-reference and invalid-amount gates for pending savings proposal revisions.

## Outcome

Proposal revision interpretation now passes through a focused service that validates the active action/proposal/event reference, maintains invalid-amount clarification flags, and delegates valid grounded replacement to the existing coordinator method. Proposal supersession, fresh action ID creation, exact approval, and ledger calls remain in their previous deterministic boundaries.

## Work Completed

- Added [`pending-savings-revision-service.ts`](../../src/agent/pending-savings-revision-service.ts) and integrated it into [`victoria-agent.ts`](../../src/agent/victoria-agent.ts).
- Added focused tests in [`pending-savings-revision-service.test.ts`](../../tests/unit/agent/pending-savings-revision-service.test.ts) proving stale references cannot replace, invalid amounts preserve the action and set clarification state, and grounded revisions delegate to replacement with the same pending action.
- Existing agent regressions continue to cover replacement proposal linkage, stale approvals, restart recovery, amount corrections, and reason corrections.
- Updated the F04 crosswalk and [`tests/test-plan.md`](../../tests/test-plan.md).

## Decisions

- The revision service is a gate and router only. It cannot approve or write; actual replacement remains in `replacePendingSavingsProposal` and requires subsequent fresh approval.
- F04 remains partial because decline orchestration and substantial pending proposal conversation behavior still live in `VictoriaAgent`.

## Verification

- Focused revision/service/agent regressions — 7 passed.
- `npm run check` — passed: agent validation, lint, source/test type checks, and 1,057 tests passed; 27 skipped and 9 todo.
- `git diff --check` — passed.
- Existing Node SQLite experimental warnings appeared during tests.

## Remaining Gaps

- Continue reducing the remaining pending proposal response and decline logic without weakening exact reference/version checks.
- Provider-backed held-out evaluation, blinded human scoring, post-optimization provider cost/latency measurement, hosted multi-worker parity, and process-crash atomicity remain open.

## Recommended Next Step

Inspect the early invalid-revision amount clarification path and the later `awaitingValidRevision` amount continuation for a common, tested workflow service boundary; preserve exact `revision_follow_up` reference matching and require a fresh approval after any replacement.
