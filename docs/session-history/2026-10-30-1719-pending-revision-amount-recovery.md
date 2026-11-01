# Session: Pending revision amount recovery

- Date: 2026-10-30
- Time: 17:19 EDT
- Status: Partial
- Scope: Extend the pending savings revision service to own malformed amount recovery and exact follow-up amount routing.

## Outcome

Malformed amount attempts that point to the active proposal now enter a scoped clarification state through the revision service. A later amount reaches proposal replacement only when its reference is `revision_follow_up` and the action, proposal, and event still match the active workflow. The new boundary retains no approval or ledger-writing authority.

## Work Completed

- Extended [`pending-savings-revision-service.ts`](../../src/agent/pending-savings-revision-service.ts) with invalid-amount attempt and awaiting-amount resolution methods; both verify matching action and workflow identity.
- Routed the corresponding early and continuation paths in [`victoria-agent.ts`](../../src/agent/victoria-agent.ts) through the service.
- Added service tests for malformed amount clarification, rejecting an amount with a non-follow-up reference, and routing a precisely grounded amount through the replacement callback in [`pending-savings-revision-service.test.ts`](../../tests/unit/agent/pending-savings-revision-service.test.ts).
- Updated the F04 status note in the [architecture follow-up crosswalk](../architecture/conversation-architecture-spec-follow-up-2026-10-29.md) and documented the requirement in [`tests/test-plan.md`](../../tests/test-plan.md).

## Decisions

- An amount-only answer can resolve this clarification only with an exact `revision_follow_up` reference and matching active action/proposal/event IDs.
- Replacement remains proposal-only and requires fresh user confirmation before any mocked ledger write.
- F04 remains partial; this slice does not resolve the broader coordinator complexity or outstanding evaluation and hosted-reliability findings.

## Verification

- Focused revision service suite — 6 passed.
- `npm run check` — passed: agent validation, lint, source/test type checks, and 1,060 tests passed; 27 skipped and 9 todo.
- `git diff --check` — passed before the final documentation/session entry.
- Existing Node SQLite experimental warnings appeared during tests.

## Unresolved

- Additional pending proposal response/decline orchestration remains in `VictoriaAgent`.
- Provider-backed held-out evaluation, blinded human scoring, post-optimization provider cost/latency measurement, hosted multi-worker parity, and process-crash atomicity remain open.
- The working tree contains the larger uncommitted review follow-up from prior work; this entry describes only the current slice.

## Recommended Next Step

Continue extracting the remaining pending proposal response and decline paths behind the same exact action/proposal/event and fresh-approval invariants, then update F04 evidence without closing the still-open human, provider, and hosted reliability gates.
