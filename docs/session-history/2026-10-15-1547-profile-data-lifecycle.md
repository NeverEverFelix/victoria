# Session: Financial Profile Lifecycle And Consent RLS

- Date: 2026-10-15
- Time: 15:47 America/New_York
- Status: Partial
- Scope: Tighten the Plaid consent database access boundary, prepare lifecycle choices for review, and verify the affected schema where local tooling permits.

## Outcome

Added owner-scoped RLS for Plaid consent history and a concrete but unapproved profile data-lifecycle proposal. Partial local PostgreSQL verification passed for the Plaid consent and transaction migrations. The complete migration chain and Supabase behavior remain unverified because the local PostgreSQL installation lacks pgvector and Docker is unavailable.

## Work Completed

- Added [migration 0007](../../db/migrations/0007_plaid_consent_rls.sql): authenticated users may read only their own consent history; only the server role can write it.
- Added [consent RLS contract test](../../tests/contracts/plaid-consent-rls.test.ts) and coverage expectation in [test-plan.md](../../tests/test-plan.md).
- Wrote [the data-lifecycle proposal](../specification/financial-profile-data-lifecycle-proposal.md), covering proposed 90-day transaction retention, disconnect deletion, consent-history/account-erasure conflict, backups, and key rotation.
- Updated [decisions.md](../decisions.md) and [agent-work-queue.md](../agent-work-queue.md) to distinguish the new RLS boundary from the still-unapproved lifecycle decisions and incomplete deployment verification.
- Used and then removed an isolated local PostgreSQL scratch database and temporary `service_role`; added only synthetic fixture rows.

## Decisions

- Confirmed existing boundary: user-authorized Plaid Transactions only; sandbox runtime remains opt-in; production reads and real-money movement remain disabled.
- The 90-day raw-data retention, disconnect deletion, audit retention, backup window, and key-rotation schedule are proposals only and require review.
- Account deletion conflicts with the append-only consent-event trigger; a dedicated erasure or pseudonymization decision is required before implementing deletion.

## Verification

- `npx vitest run tests/contracts/plaid-consent-rls.test.ts tests/contracts/plaid-data-boundary.test.ts tests/unit/app/migration-script.test.ts` passed: 3 files, 5 tests.
- Local PostgreSQL scratch DB applied migrations `0002`, `0005`, `0006`, and `0007`. With a stub `auth.uid()`, an authenticated user saw one of two users' consent and transaction rows, had no Item-token table access, and could not insert consent history.
- `npm run check` passed: 52 files passed, 6 skipped; 425 tests passed, 4 skipped, 9 todo.
- One pre-existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts:48`; Node reports the existing experimental SQLite warning.
- Full migrations `0001`-`0007` were not applied as a chain. Local PostgreSQL has no `vector` extension available, and Docker is not running; no Supabase project or credentials were used.

## Unresolved

- User review is needed for the lifecycle choices in the proposal before retention/deletion code is implemented.
- Verify the full migration chain, `0004` vector/function/RLS behavior, and owner isolation in a pgvector-enabled non-production Supabase-compatible environment.
- Implement the approved disconnect, remote Item removal, local deletion, derived-memory cleanup, backup handling, and key rotation before live reads.
- Trusted production-grade authentication and application route composition remain separate work.

## Recommended Next Step

Review and approve or revise the lifecycle proposal. Then configure a disposable pgvector-enabled non-production database and verify all migrations and RLS policies before implementing the disconnect/deletion path.
