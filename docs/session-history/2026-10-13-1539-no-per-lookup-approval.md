# Session: Remove per-lookup approval from context source selection

- Date: 2026-10-13
- Time: 15:39 America/New_York
- Status: Completed
- Scope: Clarify and implement Victoria's autonomous source choice without prompting for approval on each transaction-history lookup.

## Outcome

Victoria's source policy now selects an available transaction-history provider when a relevant estimate is missing, without an agent-side consent check or per-lookup prompt. The provider contract requires it to use the user's existing bank-link authorization, enforce user scoping, and return no data if disconnected/revoked, stale, or insufficient.

## Work Completed

- Replaced the source policy's per-request authorization flag with provider availability.
- Removed the provider consent-check method from the agent dependency. A configured provider is queried only when no explicit amount, exact remembered merchant spend, or known habit is available.
- Updated tests and post-MVP documentation to distinguish standing bank-link authorization from per-lookup approval.

## Decisions

- Confirmed: Victoria autonomously chooses whether transaction history can help; it does not ask the user each time.
- Confirmed: the data provider, not the source-selection policy, enforces the standing authorization required to read a linked bank account.
- No Plaid read adapter is implemented or connected to the default composition.

## Verification

- Targeted source-policy and memory tests passed: 16 tests.
- `npm run check` passed: 34 test files passed, 6 skipped; 342 tests passed, 4 skipped, 9 todo.
- `git diff --check` passed.

## Unresolved

- Direct transaction-history questions are not yet classified or answered.
- Plaid transaction access, approved product purpose, freshness threshold, and retention behavior remain future work.

## Recommended Next Step

When the Plaid transaction adapter is separately scoped, make its lookup implementation enforce the user's existing connection authorization and test disconnected/revoked behavior without introducing per-lookup prompts.
