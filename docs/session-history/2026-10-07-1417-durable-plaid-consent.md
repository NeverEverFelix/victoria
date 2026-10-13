# Session: Add durable Plaid consent events

- Date: 2026-10-07
- Time: 14:17 America/New_York
- Status: Consent repository and migration implemented; live PostgreSQL verification pending
- Scope: Persist append-only, user-scoped Plaid consent grants and revocations for financial-profile reads.

## Outcome

Added a PostgreSQL event log and repository for the current Plaid consent state. Grants preserve the approved read-product scope; revocations append a linked event, are idempotent for the same grant, and cannot revoke a newer grant through a stale identifier.

## Work Completed

- Added [PostgresPlaidConsentRepository](../../src/app/plaid/consent-repository.ts) with input validation, per-user transaction locking, current-consent reads, grant events, and grant-bound revocation.
- Added [migration 0002](../../db/migrations/0002_plaid_consent_events.sql) with user-linked event chains, read-product constraints, and a database trigger preventing update/delete of consent events.
- Updated [the migration runner](../../scripts/migrate-database.mjs) to apply sorted numbered migrations once each.
- Exported the repository through [app/index.ts](../../src/app/index.ts), added behavior-focused tests in [plaid-consent-repository.test.ts](../../tests/unit/app/plaid-consent-repository.test.ts), and updated the [work queue](../agent-work-queue.md) and [test plan](../../tests/test-plan.md).

## Decisions

- Consent purpose is recorded as `financial_profile`; product scope is supplied as the exact read products the user approved. Payment and transfer products are excluded.
- Grant and revocation are append-only events. A revocation names the exact grant it applies to; a later grant creates a new event and new scope.
- The repository is not yet wired to a production route or real authentication provider.

## Verification

- `npm test -- --run tests/unit/app/plaid-consent-repository.test.ts tests/unit/app/plaid-link-token.test.ts` — 34 passed.
- `npm run check` — passed: agent validation, lint, both type checks, 316 tests passed, 6 files skipped, 4 tests skipped, 9 todo.
- `git diff --check` — passed.
- No PostgreSQL instance was configured, so migration application, trigger behavior, and concurrent event ordering were not exercised against a live database.
- Pre-existing worktree changes in durable turn storage, provider comparison, response policy, and financial-profile docs were not intentionally altered in this slice.

## Unresolved

- Apply migration 0002 and exercise grants, revocations, user isolation, and concurrent operations against PostgreSQL.
- Wire a verified application session and this repository into the Link-token route.
- Define the initial profile read products and consent disclosure/version before the user-facing Link flow is built.

## Recommended Next Step

Add a narrow application composition/route that loads consent through this repository and uses the existing verified-authentication boundary, then verify it against PostgreSQL before adding public-token exchange or financial-data reads.
