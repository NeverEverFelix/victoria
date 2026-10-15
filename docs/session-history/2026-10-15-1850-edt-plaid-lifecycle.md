# Session: Transactions profile lifecycle safeguards

- Date: 2026-10-15
- Time: 18:50 EDT
- Status: Completed
- Scope: Implement the confirmed 90-day retention, disconnect/deletion, revocation retry, and versioned token-key rotation policies.

## Outcome

Added headless lifecycle operations for the approved Transactions-only Plaid profile. Raw transaction expiry, profile deletion, authenticated disconnect/delete-all handling, remote revocation retries, and versioned key rotation are represented in code and documented. Live reads remain gated on deployment and database verification.

## Work Completed

- Added migration `0007_plaid_data_lifecycle.sql` for UTC transaction expiry, encrypted revocation queue, and service-only cleanup functions.
- Added authenticated Item disconnect and delete-all handler in [disconnect-handler.ts](../../src/app/plaid/disconnect-handler.ts). The lifecycle clears local Item data, derived profile facts/embeddings and linked successor facts before remote revocation, invalidates cached memories, and retries failures with capped exponential backoff.
- Added `PlaidApiClient.revokeItem` and lifecycle maintenance operations for expiry, retries, and key rotation.
- Extended the AES-256-GCM token cipher to read configured prior key versions and write using the active version. Rotation persists and verifies each resulting envelope.
- Updated [decisions.md](../decisions.md), [agent-work-queue.md](../agent-work-queue.md), [environments.md](../environments.md), [mvp-safety-contract.md](../specification/mvp-safety-contract.md), and [test-plan.md](../../tests/test-plan.md).
- Added unit tests for authentication, revocation failure/backoff, retention invocation, and key rotation.

## Decisions

- Confirmed by the user: raw transaction details expire 90 days after their transaction date.
- Confirmed by the user: disconnect removes local access and data, requests remote Item revocation, clears derived profile facts and embeddings, and retries failed revocation while retaining only the encrypted token needed for that retry. Delete-all also revokes Transactions consent.
- Confirmed by the user: token keys are versioned; prior keys remain available for decrypt until all persisted active and queued token envelopes have been re-encrypted and verified under the active key.

## Verification

- `npm run check` passed: 52 test files passed, 6 skipped; 429 tests passed, 4 skipped, 9 TODO.
- `git diff --check` passed.
- One existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts`.
- No live Plaid calls or PostgreSQL/Supabase migrations were run.

## Unresolved

- Schedule `expire`, `retryDueRevocations`, and `rotateKeys` as operational jobs; configure bounded monitoring and alerts for queued revocations and rotation failures.
- Mount the authenticated handler through the intended application route/session boundary.
- Verify migration `0007_plaid_data_lifecycle.sql`, deletion behavior, RLS, retry queue, and key rotation against a disposable PostgreSQL/Supabase database.
- Perform a controlled rotation rehearsal before retiring any previous key. Production Plaid access remains disabled.

## Recommended Next Step

Add integration coverage against a disposable PostgreSQL/Supabase instance for migration 0007, profile/embedding purges, retention expiry, token queue retries, and rotation persistence; then wire authenticated route and scheduled-job composition.
