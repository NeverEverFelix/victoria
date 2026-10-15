# Session: Plaid lifecycle verification coverage

- Date: 2026-10-15
- Time: 18:52 EDT
- Status: Completed
- Scope: Expand lifecycle coverage for retention boundaries, scoped deletion, revoked consent, remote revocation retry, and token rotation.

## Outcome

Added unit and contract coverage below the service boundary for the previously implemented Transactions profile lifecycle. Updated the lifecycle contract and test plan to map rules to those checks.

## Work Completed

- Added repository tests for UTC 90-day expiration, expired-read filtering, owner-scoped Item reads, complete deletion statements, and foreign Item rejection in [plaid-data-repository.test.ts](../../tests/unit/app/plaid-data-repository.test.ts).
- Added a migration contract test for retention expressions, scoped profile/embedding cleanup, and encrypted server-only revocation queue fields in [plaid-data-lifecycle.test.ts](../../tests/contracts/plaid-data-lifecycle.test.ts).
- Extended lifecycle tests to cover revocation retry recovery and rotation failure paths; extended sync tests to prove consent revocation between pages stops provider access and profile persistence.
- Updated the `LIFE-001` through `LIFE-006` coverage mapping in [mvp-safety-contract.md](../specification/mvp-safety-contract.md), and added the verification matrix to [test-plan.md](../../tests/test-plan.md) and [agent-work-queue.md](../agent-work-queue.md).

## Decisions

- No product policy changed. The confirmed 90-day retention, disconnect/delete-all, revocation retry, and versioned key-rotation policies remain recorded in [decisions.md](../decisions.md).
- Database integration behavior still requires verification against disposable PostgreSQL/Supabase before live reads.

## Verification

- `npm run check` passed: 54 test files passed, 6 skipped; 439 tests passed, 4 skipped, 9 TODO.
- `git diff --check` passed.
- One pre-existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts`.
- No live Plaid calls or database migrations were run.

## Unresolved

- Static migration-contract checks and scripted repository tests do not replace executing migration 0007 and validating cascade/trigger behavior on PostgreSQL.
- Production scheduling, authenticated route mounting, and controlled key-rotation rehearsal remain outstanding.

## Recommended Next Step

Run lifecycle integration tests against a disposable PostgreSQL/Supabase database, including a user with multiple linked Items and superseding profile facts, before mounting the route or enabling scheduled live reads.
