# Session: Route estimate context between memory and transaction history

- Date: 2026-10-13
- Time: 15:28 America/New_York
- Status: Completed as a policy and provider seam; Plaid integration remains out of scope
- Scope: Add deterministic source selection for avoided-spend estimates and an optional consent-gated transaction-history provider boundary.

## Outcome

For an avoided-spend estimate, Victoria uses an exact user-scoped remembered merchant amount or existing known habit first. When no relevant amount is available, it checks active Transactions consent through an injected provider before requesting a merchant summary. If consent is unavailable, the consent check fails, or the provider fails or returns invalid data, Victoria asks the user for the amount.

## Work Completed

- Added [the context source policy](../../src/agent/context-source-policy.ts) and the optional [transaction-history provider contract](../../src/agent/transaction-history-provider.ts).
- Integrated the source choice into the avoided-spend estimate path. Provider calls receive the authenticated request's user ID and classified merchant; only validated cent amounts, counts, and non-future observation times can become a suggestion.
- Kept user-provided amounts and matching known habits ahead of any transaction-history check. Provider failures degrade to clarification.
- Added source-policy and agent-flow coverage for memory priority, authorized transaction history, user isolation, denied/failing access, and no premature ledger write.
- Documented that this is post-MVP scaffolding. No Plaid transaction adapter is wired, and no bank data is fetched by default.

## Decisions

- Confirmed: memory is preferred when it has the relevant same-user merchant amount; history is considered only when the estimate lacks one.
- Confirmed: a provider must enforce active user-scoped Transactions consent on every read and return no result for stale or insufficient history. The agent also fails closed on consent or provider errors.
- Confirmed: transaction-derived estimates still require the existing explicit approval before mocked-ledger recording.
- The supported current behavior is the estimate source-selection path. General transaction-history question answering and Plaid implementation remain future work.

## Verification

- Targeted source-policy and memory tests passed: 16 tests.
- `npm run check` passed: 34 test files passed, 6 skipped; 342 tests passed, 4 skipped, 9 todo.
- `git diff --check` passed.
- Node emitted the existing experimental SQLite warnings.

## Unresolved

- The optional provider has no implementation connected to Plaid; the default composition does not use transaction history.
- Plaid scope/purpose, freshness threshold, secure access-token lifecycle, retention, disconnect/deletion behavior, and production wiring remain undefined and require separate product and safety review.
- Direct user questions about transaction history are not yet classified or answered by a transaction-summary capability.

## Recommended Next Step

Define the permitted transaction-history purpose and freshness/retention rules before implementing a Plaid read adapter. If direct history questions are needed, specify their summaries and supported intents as a separate headless slice.
