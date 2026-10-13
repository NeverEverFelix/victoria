# Session: Expand Plaid Link contract tests

- Date: 2026-10-07
- Time: 14:04 America/New_York
- Status: Contract tests expanded; two behavior gaps remain failing
- Scope: Strengthen tests for the consent-gated Plaid Link bootstrap independently of the current implementation.

## Outcome

Expanded the endpoint and provider-client tests from 7 to 28 cases. The contract suite verifies denial and failure paths, identity and product-scope provenance, token privacy, sandbox request shape, and malformed provider/consent behavior. Two tests expose gaps in the current code.

## Work Completed

- Expanded [plaid-link-token.test.ts](../../tests/unit/app/plaid-link-token.test.ts) with method, authentication, consent, scope, request-forgery, cache, provider failure, and adapter-boundary cases.
- Kept behavior gaps visible instead of changing implementation to make the test run pass.

## Decisions

- Tests assert that malformed persisted consent fails closed without throwing and that the provider client independently refuses payment/transfer products before making a network request.
- Current code remains unchanged during this test-only session.

## Verification

- `npm test -- --run tests/unit/app/plaid-link-token.test.ts` — 26 passed, 2 failed.
- `npm run typecheck:test` — passed.
- `git diff --check` — passed.

Failing cases:

- Malformed consent with `products: null` throws instead of returning a controlled denial.
- Calling the Plaid client directly with a transfer product sends that product to Plaid instead of rejecting before the request.

## Unresolved

- Decide whether to fix both gaps in the current vertical slice. Both are safety-oriented and should be addressed before wiring the client to an application route.

## Recommended Next Step

Fix malformed consent validation and add an independent read-product allowlist check in `PlaidLinkTokenClient`, then rerun the expanded tests and full check.
