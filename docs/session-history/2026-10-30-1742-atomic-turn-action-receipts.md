# Session: Atomic turn action receipts

- Date: 2026-10-30
- Time: 17:42 EDT
- Status: Partial
- Scope: Close the local post-action process-crash gap by committing recoverable turn results atomically with approved persistent mock-ledger mutations.

## Outcome

Persistent savings entries, entry corrections, and goal allocations can now commit a restricted result receipt into the exact running turn in the same PostgreSQL transaction as the approved mocked-ledger mutation. A redelivered turn worker or an authenticated result poll can finish the turn from that receipt without invoking the agent again.

## Work Completed

- Added the authenticated durable `turnId` to `AgentRequest` and passed it from synchronous chat and queued-turn processing.
- Added a scoped `TurnActionReceipt` carrying only the public result message, action, and classification required for recovery.
- Updated [`postgres-mock-savings-tools.ts`](../../src/app/savings/postgres-mock-savings-tools.ts) to validate the receipt scope and expected action, then save it in `victoria_turns.result_payload` on the same transaction client as the ledger mutation. The existing turn result column is reused; no migration was needed.
- Added [`turn-action-receipt.ts`](../../src/app/turns/turn-action-receipt.ts) validation and recovery paths in the queued processor and authenticated result handler. Valid receipts on running or failed turns are finalized without rerunning the agent/action.
- Added worker and polling unit regressions plus a loopback PostgreSQL integration scenario that commits a savings entry, leaves the turn running to model a crash, redelivers the worker, and verifies one entry and a completed result.
- Updated [`tests/test-plan.md`](../../tests/test-plan.md) and the [architecture review crosswalk](../architecture/conversation-architecture-spec-follow-up-2026-10-29.md).

## Decisions

- Action receipts are limited to the three currently supported approved persistent mock-ledger mutations: savings entries, corrections, and goal allocations. Real-money movement remains unsupported.
- A receipt is accepted only when its user, conversation, running turn, and action match the transaction; failure to persist it rolls back the mocked-ledger write.
- This closes the post-action crash window when the worker is redelivered or the authenticated result endpoint is polled. It does not add automatic scanning/scheduling for orphaned turns or resolve crashes before the action transaction.

## Verification

- Focused queue, result-handler, and agent tests — 213 passed during the final targeted runs.
- `npm run check` — passed: agent validation, lint, source/test type checks, and 1,081 tests passed; 28 skipped and 9 todo.
- Isolated loopback PostgreSQL integration suite on `victoria_integration_local` — passed, 21/21.
- `git diff --check` — passed.
- Existing Node SQLite experimental warnings appeared during tests.

## Unresolved

- Pre-action orphan discovery/scheduling and hosted outage or multi-worker parity remain open under F07.
- F04 remains partial; `VictoriaAgent` still contains substantial orchestration requiring seam-by-seam parity work.
- Human conversation/relevance scoring and post-optimization live provider measurements remain open. Live provider comparison was not run because the repository requires the explicit charge-confirmation flag.
- The worktree contains a large uncommitted set of earlier architecture-review changes; this entry records only the current slice.

## Recommended Next Step

Add a bounded stale-turn discovery/recovery worker that uses compare-and-transition claims and never replays a financial operation without a valid action receipt. Before enabling it in a hosted environment, define its schedule, lease/fencing behavior, outage tests, and operational retry policy.
