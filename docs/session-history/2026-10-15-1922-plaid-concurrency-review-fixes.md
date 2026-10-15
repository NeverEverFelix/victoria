# Session: Plaid Concurrency and Retry Review Fixes

- Date: 2026-10-15
- Time: 19:22 America/New_York
- Status: Completed
- Scope: Address the remaining actionable Plaid lifecycle review findings on PR #16.

## Outcome

Added atomic token rotation, leased and user-scoped revocation claims, and manual-review handling for permanent provider rejections. Tightened the disconnect API input and response contract.

## Work Completed

- `listDueRevocations` now atomically claims rows with `FOR UPDATE SKIP LOCKED` and a 30-minute lease. Disconnect-time claims are filtered by authenticated user and optional Item ID. Expired claims can be reclaimed after worker failure.
- New disconnect queue rows are claimed for immediate processing; existing queue conflicts are not treated as fresh immediate work, preserving their retry backoff and attempt count.
- Token rotation now updates either the active Item or encrypted retry row and verifies it inside a transaction, rolling back on mismatch.
- Plaid HTTP 429/5xx failures remain retryable with backoff. Other HTTP failures are moved to `manual_review` with a safe status-only error code; encrypted credentials remain stored and local reads stay disabled.
- Renamed the disconnect response count to `pendingRevocations`, capped Item IDs at 128 characters, and expanded lifecycle unit/contract coverage.
- Updated lifecycle policy, environment guidance, the agent work queue, and test plan to describe the manual-review behavior.

## Decisions

- Retryable provider errors continue with bounded exponential backoff up to the existing 24-hour interval.
- Permanent provider rejections require operator review; the encrypted token remains retained until revocation is confirmed. Live reads remain disabled until an operator workflow for manual-review records is provided.
- No change was made for review findings already checked against earlier schema constraints and migrations.

## Verification

- `npm run check` passed: 54 test files passed, 6 skipped; 449 tests passed, 4 skipped, 9 todo.
- The existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts:48` (`_observedThrough` unused).
- No live Plaid or database calls were made.

## Unresolved

- A privileged operator workflow to inspect and resume `manual_review` records is still required before live reads.
- Migration 0007 and multi-worker behavior still need disposable PostgreSQL/Supabase verification before deployment.
- This update needs fresh PR CI and AI review. PR #16 remains unmerged.

## Recommended Next Step

Review the pushed PR and confirm that the new migration and queue-claim behavior pass automated review and disposable database verification before enabling any lifecycle jobs.
