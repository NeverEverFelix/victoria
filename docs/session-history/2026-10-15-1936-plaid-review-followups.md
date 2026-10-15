# Session: Plaid review follow-ups

- Date: 2026-10-15
- Time: 19:36 EDT
- Status: Completed
- Scope: Implemented the confirmed queue identity, maintenance gating, and AI review guidance fixes after PR #16 was merged.

## Outcome

Added a user-scoped composite identity for revocation records, a default-off token-maintenance gate, and explicit trusted-code safeguards for pull-request AI review. Work is local on `fix/plaid-review-followups` and has not been committed or pushed.

## Work Completed

- Added [migration 0008](../../db/migrations/0008_plaid_revocation_user_scope.sql) to key revocation queue rows by `(user_id, item_id)` and updated queue conflict handling and worker joins to use both fields.
- Added `PLAID_TOKEN_MAINTENANCE_ENABLED`, defaulting to false, and made token enumeration/replacement fail before database access unless explicitly enabled.
- Clarified in the [test plan](../../tests/test-plan.md) that the PR review checks out the immutable trusted base SHA, treats the diff as untrusted data, and never executes PR-controlled code; extended agent setup validation to preserve this guidance.
- Added config, repository guard, and contract coverage for these boundaries.

## Decisions

- The review’s concern that the active Items table has a global Item-ID uniqueness constraint does not remove the value of user-scoped queue identity; queue writes and joins now consistently bind both user and Item.
- Token maintenance remains unavailable by default and requires its own explicit environment toggle in addition to the opted-in Plaid runtime.
- The AI review job intentionally needs narrowly scoped write permissions to post review comments. Only trusted base-branch code receives those credentials; PR code and artifacts are never checked out or executed.

## Verification

- `npm run check` — passed: 54 test files passed, 6 skipped; 454 tests passed, 4 skipped, 9 todo.
- `git diff --check` — passed.
- Existing ESLint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:48` (`_observedThrough` unused).

## Unresolved

- The changes have not been committed or pushed and have not received a fresh AI review.
- Existing deployment gates remain: operator workflow for permanent revocation failures and production-like database migration/RLS verification before enabling live reads.

## Recommended Next Step

Review the local diff. After approval, commit and push this branch for CI and AI review.
