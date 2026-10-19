# Session: Serialize terminal savings actions

- Date: 2026-10-18
- Time: 19:51 America/New_York
- Status: Partial
- Scope: Close the approval-versus-decline race in the local persistent mocked savings lifecycle.

## Outcome

Approval and decline writes now share a PostgreSQL advisory transaction lock scoped to user and approved action. The approval adapter writes the mocked ledger entry and recorded proposal transition atomically. The live $27 demo proposal remains pending; no confirmation was submitted.

## Work Completed

- Updated [the pending savings action store](../../src/app/savings/postgres-pending-savings-action-store.ts) to serialize terminal transitions and reject decline/supersession if the mocked ledger entry already exists.
- Updated [the persistent mock ledger adapter](../../src/app/savings/postgres-mock-savings-tools.ts) to acquire the same lock, validate against the persisted pending proposal, reject conflicting terminal outcomes, and commit the ledger row plus recorded transition in one transaction.
- Updated [agent work queue](../../docs/agent-work-queue.md) and [test plan](../../tests/test-plan.md) with the new behavior and required concurrency coverage.

## Decisions

- The savings lifecycle remains a mocked ledger only; the active demo proposal is not treated as approved.
- Per the repo boundary, concurrency behavior is documented as needing runtime coverage before this slice is considered fully verified.

## Verification

- `npm run typecheck` passed.
- `npm run typecheck:test` passed.
- No test suite was run for this concurrency change, so race behavior has not been proven under concurrent database requests.

## Unresolved

- Add and run PostgreSQL concurrency coverage for simultaneous approval/decline and duplicate approval.
- Cross-process conversation leases remain outstanding.
- Persistent chat is still local-only and has no user-facing chat page or trusted login issuer.

## Recommended Next Step

Add focused database integration coverage for terminal-action races, then rerun the local persistent chat flow before considering staging.
