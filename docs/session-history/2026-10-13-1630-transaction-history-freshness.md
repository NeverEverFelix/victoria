# Session: Transaction History Freshness Boundary

- Date: 2026-10-13
- Time: 16:30 America/New_York
- Status: Completed
- Scope: Bound optional transaction-history evidence to a freshness window and verify stale data is ignored.

## Outcome

The optional transaction-history seam now accepts only validated summaries based on at least three transactions and observed within the last 90 days. Old, future-dated, malformed, and otherwise invalid summaries are treated as unavailable.

## Work Completed

- Added a shared validator and 90-day maximum age in [transaction-history-provider.ts](../../src/agent/transaction-history-provider.ts).
- Applied the validator to merchant-claim verification and avoided-spend estimates in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added deterministic freshness boundary tests and agent behavior coverage for stale evidence in [transaction-history-provider.test.ts](../../tests/unit/agent/transaction-history-provider.test.ts) and [preference-memory.test.ts](../../tests/unit/agent/preference-memory.test.ts).
- Updated the provider contract, story, safety contract, and test plan.

## Decisions

- The optional seam uses a 90-day maximum age and a minimum of three transactions as a conservative implementation threshold. This does not enable Plaid or settle all future profile freshness rules.
- Existing memory-first source selection and user-scoped provider contract remain in effect.

## Verification

- Targeted agent tests passed: 2 files, 19 tests.
- `npm run check` passed: agent validation, lint, source and test type checks, 35 test files passed, 6 skipped; 349 tests passed, 4 skipped, 9 todo.
- Existing Node experimental SQLite warnings remain.

## Unresolved

- There is still no live Plaid transaction adapter or provider integration test against Plaid. The seam remains optional scaffolding.
- The 90-day window should be reviewed alongside any future product decision on financial-profile freshness and retention.
- The worktree contains other pre-existing changes and untracked session records from earlier slices; they were not altered as part of this freshness change.

## Recommended Next Step

Add a provider-adapter test seam for merchant normalization and per-user isolation before any real transaction-history integration is considered.
