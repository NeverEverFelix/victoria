# Session: Hosted Authorization Smoke Check

- Date: 2026-10-22
- Time: 14:55 America/New_York
- Status: Partial
- Scope: Prepare a repeatable hosted staging check for authenticated chat, memory controls, and owner-based authorization.

## Outcome

Documented the MVP authorization contract and added a staging smoke runner that verifies two Supabase users and checks cross-user boundaries through the deployed API. The live run remains pending staging URL and test-user credentials.

## Work Completed

- Added `npm run verify:staging:authorization` backed by [verify-hosted-authorization.mjs](../../scripts/verify-hosted-authorization.mjs).
- The runner verifies both access tokens directly with Supabase Auth, requires distinct subjects and an explicit staging confirmation, rejects unauthenticated chat, checks cross-user pending-action and conversation-finish isolation, compares memory listings, and attempts foreign-memory correction/forget when user A has a current memory.
- The synthetic user A savings proposal is declined at the end. The script prints assertions and the generated conversation ID, but no tokens or memory contents.
- Recorded the owner-based authorization contract in [Story 17](../user-stories.md), the [test plan](../../tests/test-plan.md), and the [memory operations runbook](../operations/memory-lifecycle-and-recovery.md).

## Decisions

- Confirmed: the MVP has no admin or cross-user support role. A verified user may access only resources owned by the verified Supabase subject.
- Confirmed: current hosted code already derives user scope from Supabase Auth and applies user-scoped storage queries; the memory-management API additionally uses `victoria_memory_api` and transaction-local RLS scope. This session makes the contract and live verification explicit rather than introducing a second role system.

## Verification

- `npm run check` passed: 500 tests passed, 15 skipped, 9 todo; 7 test files skipped.
- `git diff --check` passed.
- Existing ESLint warning for `_observedThrough` and Node SQLite experimental warnings remain.
- The live staging runner was not executed: this workspace has no staging URL or configured Supabase/user tokens.

## Unresolved

- Run the smoke check against the current staging deployment with two distinct test users.
- If user A has no current memory, foreign-memory correction/forget checks are skipped; seed an ordinary test preference through that test account before rerunning those checks.
- Continue the separate rollout checks for authenticated hosted endpoint availability, Supabase backup retention, and staging retention scheduling.

## Recommended Next Step

Deploy the current code to staging, obtain short-lived access tokens for two staging test users, and run the documented command. Review every assertion before treating hosted authorization as verified.
