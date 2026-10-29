# Session: Local persistent savings corrections

- Date: 2026-10-18
- Time: 21:06 America/New_York
- Status: Completed
- Scope: Persist approved savings-entry corrections in local PostgreSQL mode and include them in effective amount, weekly total, and goal allocation reads.

## Outcome

Local persistent mode stores savings corrections as immutable signed adjustments linked to the original mocked entry. A fresh tool instance reconstructs correction history, calculates the effective amount and weekly total, and accepts a goal allocation for that corrected amount while preserving the original ledger amount.

## Work Completed

- Added local-only migration `0014_local_savings_entry_corrections.sql`, including per-user/action uniqueness, amount arithmetic checks, RLS, and an append-only trigger.
- Added durable correction creation, retry conflict checks, correction listing/hydration, effective amount reads, and weekly total integration to [PostgresMockSavingsTools](../../src/app/savings/postgres-mock-savings-tools.ts).
- Updated inherited mock-tool hydration so persisted adjustments feed deterministic totals.
- Added a PostgreSQL integration scenario for correction persistence across tool instances, effective amount and weekly totals, retry idempotency, goal allocation against the corrected amount, and preservation of the original entry.
- Updated [the MVP contract](../mvp.md), [environment notes](../environments.md), [the agent work queue](../agent-work-queue.md), and [the test plan](../../tests/test-plan.md).

## Decisions

- Confirmed behavior: a correction appends a signed adjustment; it does not rewrite the original saved entry.
- Migration `0014` is local-only and was not applied to hosted Supabase projects.
- Pending correction proposals remain runtime-scoped; this slice makes committed corrections durable, not pending correction prompts.

## Verification

- `npm run check` passed: 470 tests passed, 14 skipped, 9 todo. The existing lint warning in `tests/unit/agent/memory-orchestrator.test.ts` remains.
- The fresh PostgreSQL persistent-chat integration suite passed: 10 tests.
- Migration `0014` and its table are present in the configured local database.
- The disposable `victoria_integration_local` database was dropped after verification.

## Unresolved

- Pending savings-correction proposals and their issued approvals are not restored after runtime restart.
- Trusted sign-in, staging/production chat wiring, local semantic embeddings, physical retention/deletion policy, and memory UI remain outside this headless local slice.
- The working tree contains broader uncommitted work from earlier sessions; this session did not commit changes.

## Recommended Next Step

Persist pending savings-correction proposals and exact approval state so the user can resume the correction after a local runtime restart without the target entry or approval becoming ambiguous.
