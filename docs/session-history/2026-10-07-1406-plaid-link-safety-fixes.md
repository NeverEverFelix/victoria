# Session: Fix Plaid Link contract failures

- Date: 2026-10-07
- Time: 14:06 America/New_York
- Status: Both reported safety gaps fixed and verified
- Scope: Make consent validation robust to malformed persisted data and enforce the read-product boundary inside the Plaid client.

## Outcome

The handler now returns a controlled invalid-consent response for malformed records instead of throwing. The Plaid client independently rejects empty or unsupported product lists before calling the provider, including payment and transfer products.

## Work Completed

- Added runtime validation for authenticated identity and the consent record shape in [create-link-token-handler.ts](../../src/app/plaid/create-link-token-handler.ts).
- Added a shared read-product predicate and applied it inside [plaid-link-token-client.ts](../../src/app/plaid/plaid-link-token-client.ts) before network access.
- Kept the behavior-focused tests from [plaid-link-token.test.ts](../../tests/unit/app/plaid-link-token.test.ts), including the formerly failing scenarios.

## Decisions

- Malformed consent records return a controlled 400 response; missing, revoked, or cross-user consent remains a 403 denial.
- Unsupported products are rejected at both the HTTP handler and provider-client boundary.

## Verification

- `npm test -- --run tests/unit/app/plaid-link-token.test.ts` — 28 passed.
- `npm run check` — passed: agent validation, lint, both type checks, 310 tests passed, 6 files skipped, 4 tests skipped, 9 todo.
- `git diff --check` — passed.

## Unresolved

- Durable consent persistence and server-route wiring remain pending, as documented in the work queue.

## Recommended Next Step

Implement durable user-scoped consent and revocation records before wiring this handler to a live application route.
