# Session: Advisory interpretation for ambiguous pending replies

- Date: 2026-10-30
- Time: 16:46 EDT
- Status: Partial
- Scope: Continue F01/F04 implementation work by routing ambiguous correction and goal-allocation replies through contextual, read-only interpretation.

## Outcome

When configured, the read-only responder now receives ambiguous pending correction/allocation turns with the workflow label and an explicit baseline that the action remains unchanged. The responder can interpret the user's full turn but cannot authorize the workflow; deterministic exact approval, decline, and replacement handling remains in place.

## Work Completed

- Updated [`pending-workflow-response-service.ts`](../../src/agent/pending-workflow-response-service.ts) so ambiguous correction and goal-allocation replies reach contextual interpretation when available; the static yes/no clarification remains the fallback when no responder is configured.
- Added a focused regression proving an ambiguous goal-allocation reply reaches the responder without calling approval or clearing the pending action in [`pending-workflow-response-service.test.ts`](../../tests/unit/agent/pending-workflow-response-service.test.ts).
- Updated the F01/F04 crosswalk and [`tests/test-plan.md`](../../tests/test-plan.md) to document advisory interpretation and deterministic action boundaries.

## Decisions

- Confirmed: ambiguous replies may be interpreted conversationally, but only the existing deterministic exact-action authorization path can approve or mutate.
- F01 and F04 remain partial. This slice does not establish provider quality, and substantial savings-proposal orchestration remains in `VictoriaAgent`.

## Verification

- Focused pending workflow policy, service, and agent tests — 210 passed.
- `npm run check` — passed: agent validation, lint, source/test type checks, and 1,050 tests passed; 27 skipped and 9 todo.
- `git diff --check` — passed.
- Existing Node SQLite experimental warnings appeared during tests.

## Remaining Gaps

- Continue reducing `VictoriaAgent` coordinator complexity through parity-tested workflow slices.
- Provider-backed held-out paraphrase coverage, blinded human review, post-optimization provider cost/latency runs, hosted multi-worker parity, and abrupt process-crash recovery remain unverified external or integration gates.

## Recommended Next Step

Inspect the pending savings-proposal response path for a separable read-only interpretation boundary. Keep exact-action approval, revision/version checks, and ledger mutation inside deterministic policy until parity tests cover any extraction.
