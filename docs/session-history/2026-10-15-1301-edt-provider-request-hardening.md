# Session: Provider request hardening

- Date: 2026-10-15
- Time: 13:01 EDT
- Status: Completed
- Scope: Address verified provider-request safety findings from the AI review.

## Outcome

Plaid requests now reject redirects so credentials cannot be forwarded to a redirected host; memory/evidence and prior review fixes remain covered.

## Work Completed

- Set `redirect: "error"` on Plaid API and Link-token requests and covered both clients in their tests.
- Changed ASCII keyword matching and provider normalization to locale-independent lowercase; normalized provider strings by trimming them.

## Decisions

- Plaid API payloads may contain non-USD transactions, but profile aggregation explicitly filters to USD. This preserves raw currency identification and avoids interpreting foreign amounts as USD.
- The explicit repo-approved read-only Transactions profile boundary remains; no production access or money movement is enabled.

## Verification

- `npm run check` passed: 50 test files passed, 6 skipped; 420 passed, 4 skipped, 9 TODO.
- `git diff --check` passed.
- One existing ESLint warning remains in the missing-profile-observation test.

## Unresolved

- Provider sandbox calls and live migrations were not exercised locally.
- PR #13 remains open for user merge.

## Recommended Next Step

Review the PR and merge when ready.
