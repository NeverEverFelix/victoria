# Session: Approved Profile Lifecycle Defaults

- Date: 2026-10-15
- Time: 16:08 America/New_York
- Status: Completed locally
- Scope: Implement the user-approved Plaid transaction retention and disconnect behavior while preserving Victoria's user-authored memory and personalization.

## Outcome

Implemented the approved 90-day raw transaction maximum, consent-first Plaid disconnect, scoped deletion of Plaid-derived memories, pending provider-removal retries, and controlled consent-history erasure for full account deletion. User-authored memories and personalization are preserved, including corrections previously linked to Plaid profile facts.

## Work Completed

- Added `0008_profile_data_lifecycle.sql` with disconnect retry state and service-role-only procedures for Plaid profile and consent-history erasure.
- Added an authenticated disconnect handler and lifecycle service. Disconnect revokes consent, disables future sync, deletes raw transaction rows and Plaid-derived memories/embeddings, then calls Plaid Item removal. Failed provider removal retains only the encrypted token envelope for retry.
- Added a memory erase path that invalidates the user's aggregate memory cache and preserves user-authored statements, corrections, habits, goals, preferences, and other non-Plaid facts. Corrections linked to deleted Plaid facts are retained and re-rooted.
- Added transaction pruning after full sync and profile persistence succeed.
- Updated [lifecycle specification](../specification/financial-profile-data-lifecycle-proposal.md), [decisions](../decisions.md), MVP/story/test-plan docs, and [work queue](../agent-work-queue.md).
- Added tests for memory preservation, disconnect ordering and retry behavior, successful profile retention pruning, and the Plaid Item removal request.

## Decisions

- Confirmed by the user: keep raw transaction rows at most 90 days and prune only after successful complete sync/profile persistence.
- Confirmed by the user: on disconnect, delete Plaid-linked transaction data and Plaid-derived profile memories/embeddings.
- Confirmed by the user: preserve all user-authored Victoria memory and personalization. Re-root preserved corrections if their removed Plaid source was deleted.
- Confirmed by the user: retain minimal consent history until full account deletion, then erase it through a restricted service-role database procedure after Plaid cleanup.
- These decisions do not enable production Plaid reads or real money movement.

## Verification

- `npm run check` passed: agent validation, lint, both TypeScript checks, and tests; 53 files passed, 6 skipped; 430 tests passed, 4 skipped, 9 todo.
- One existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts:48`; Node reports the existing experimental SQLite warning.
- Migration 0008 was not applied to PostgreSQL. The previous session found no local pgvector extension/Docker setup; verify the migration and RLS behavior in a disposable pgvector-enabled Supabase-compatible environment before live use.
- No live Plaid, OpenAI, or database calls were made. No remote PR update or AI code review was triggered.

## Unresolved

- Verify migration 0008 and all migrations together against a pgvector-enabled non-production Supabase-compatible database.
- Choose backup deletion and encryption-key rotation windows and implement them in the selected deployment environment.
- Mount the disconnect handler behind the deployed trusted session authentication and account-deletion coordinator.

## Recommended Next Step

Run the full migration chain and lifecycle procedures in a disposable pgvector-enabled non-production database, then wire the returned disconnect handler into the authenticated server route and account-deletion coordinator.
