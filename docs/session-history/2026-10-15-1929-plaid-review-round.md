# Session: Plaid lifecycle review follow-up

- Date: 2026-10-15
- Time: 19:29 EDT
- Status: Completed
- Scope: Addressed the remaining actionable AI review findings on the Plaid data lifecycle branch.

## Outcome

Hardened disconnect request handling, transaction date calculations, revocation queue claims, and token rotation boundaries. The branch remains unmerged for review.

## Work Completed

- Normalized profile retention date comparisons to UTC and removed the obsolete disconnect marker column in [migration 0007](../../db/migrations/0007_plaid_data_lifecycle.sql).
- Added bounded JSON request parsing and consistent method responses in [disconnect-handler.ts](../../src/app/plaid/disconnect-handler.ts).
- Moved all-token encrypted credential maintenance into the explicit [token maintenance repository](../../src/app/plaid/plaid-token-maintenance-repository.ts), separate from ordinary profile reads.
- Scoped queue claims to the requesting user/Item during disconnect and retained retry/manual-review state; exposed sanitized provider error codes and rotation progress guidance.
- Added or updated targeted lifecycle tests.

## Decisions

- Confirmed lifecycle policy remains: 90 calendar days from transaction date; local profile facts and embeddings are purged on disconnect/deletion; remote Item revocation is retried and permanent failures require operator review; key rotation verifies persisted credentials.
- A permanent revocation failure keeps only the encrypted credential needed for eventual retry/operator resolution. Live reads remain gated on an operator workflow and production database verification.
- Migration backfill concerns about nullable transaction dates and expiry values were reviewed against the existing schema/backfill constraints; no change was warranted.

## Verification

- `npm run check` — passed: 54 test files passed, 6 skipped; 451 tests passed, 4 skipped, 9 todo.
- `git diff --check` — passed.
- Existing ESLint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:48` (`_observedThrough` unused).

## Unresolved

- The operator workflow for permanent revocation failures and disposable production-like database migration/RLS verification remain deployment gates before enabling live reads.
- This session's changes have not yet been pushed for a fresh external review.

## Recommended Next Step

Commit and push this review round, then inspect fresh CI and AI review results. Keep the PR open and unmerged pending review.
