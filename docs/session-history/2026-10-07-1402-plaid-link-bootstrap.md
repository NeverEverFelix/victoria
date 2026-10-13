# Session: Add consent-gated Plaid Link bootstrap

- Date: 2026-10-07
- Time: 14:02 America/New_York
- Status: Sandbox token-creation slice implemented and checked; route wiring and durable consent remain pending
- Scope: Add a headless, authenticated and consent-gated endpoint boundary that requests a Plaid Link token without fetching financial data.

## Outcome

Added a test-covered handler and minimal server-side Plaid client for creating sandbox Link tokens. The flow requires an authenticated identity and an active consent record loaded for that identity, permits only the record's supported read products, and rejects payment/transfer products.

## Work Completed

- Added [create-link-token-handler.ts](../../src/app/plaid/create-link-token-handler.ts), which authenticates, loads user-scoped consent, validates read products, and returns only the Link token.
- Added [plaid-link-token-client.ts](../../src/app/plaid/plaid-link-token-client.ts), a sandbox-only adapter for Plaid `/link/token/create`.
- Added [plaid-link-token.test.ts](../../tests/unit/app/plaid-link-token.test.ts) covering authentication, missing/mismatched consent, product rejection, provider failures, request shape, and response validation.
- Exported the new interfaces and updated the [work queue](../agent-work-queue.md) and [test plan](../../tests/test-plan.md).

## Decisions

- This first slice stops at Link token creation. It does not exchange a `public_token`, fetch accounts or transactions, persist financial data, build the profile, write agent memory, or add UI.
- The initial HTTP adapter is sandbox-only. The handler's authentication and consent repository are injected seams; production route wiring and durable consent records remain unimplemented.
- No Plaid products were hard-coded as Victoria's product choice. Products must come from the active user-scoped consent record; product scope remains an open decision.
- Plaid's official flow creates a short-lived Link token before Link and exchanges a returned public token in a subsequent step; its product guidance recommends limiting initialized products to the use case. See [Link API](https://plaid.com/docs/api/link/) and [product initialization guidance](https://plaid.com/docs/link/initializing-products/).

## Verification

- `npm test -- --run tests/unit/app/plaid-link-token.test.ts` — passed during the initial implementation (7 tests).
- `npm run check` — passed: agent validation, lint, both type checks, 290 tests passed, 6 files skipped, 4 tests skipped, 9 todo.
- `git diff --check` — passed.
- No live Plaid credentials or network calls were used; provider behavior is covered by mocked fetch.
- Other uncommitted changes in durable turn storage, provider comparison, agent response policy, and profile-scope docs were pre-existing and not altered as part of this slice.

## Unresolved

- Persist consent and revocation as durable, append-only user-scoped records.
- Wire real verified application authentication and the consent repository to a server route.
- Decide the minimum initial read products and their purpose before building the Link client flow.
- Implement secure public-token exchange and access-token storage before reading financial data.

## Recommended Next Step

Define the first profile read purpose/products and consent record lifecycle, then add durable consent storage and route wiring. Keep account/transaction reads out of scope until access-token exchange and secure storage are designed.
