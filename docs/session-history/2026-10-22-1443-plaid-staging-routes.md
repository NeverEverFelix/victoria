# Session: Mount Signed-In Plaid Profile Routes

- Date: 2026-10-22
- Time: 14:43 America/New_York
- Status: Partial
- Scope: Connect the approved Transactions-only Plaid sandbox workflow to authenticated staging API routes.

## Outcome

Staging now has server route composition for consent, Plaid Link bootstrap, public-token exchange, profile refresh, and disconnect. Every handler uses the Supabase Auth verified subject; the financial-profile runtime remains explicitly disabled by default and only supports the Plaid sandbox.

## Work Completed

- Added `PLAID_FINANCIAL_PROFILE_ENABLED` staging-only runtime gating and `getPersistentPlaidRuntime` composition with validated Supabase, database, Plaid, and token-encryption configuration.
- Added authenticated consent disclosure and grant handling. Scope is fixed server-side to Transactions for financial profiling; the notice reports the 90-day window, retained data types, encrypted sync token, no balance access, and no transfers.
- Mounted routes for `GET/POST /api/plaid/consent`, `POST /api/plaid/link-token`, `POST /api/plaid/token-exchange`, `POST /api/plaid/profile/refresh`, and `POST /api/plaid/disconnect`.
- Added tests for explicit consent, owner scoping, fixed product scope, and staging-only enablement.
- Updated [Story 12](../user-stories.md), [MVP profile scope](../mvp.md), [environment guide](../environments.md), [test plan](../../tests/test-plan.md), [work queue](../agent-work-queue.md), and [decisions](../decisions.md).
- Corrects the earlier [conversation-memory session entry](2026-10-22-1438-conversation-memory-finish.md): at that time Plaid routes were not mounted; they are now mounted in source for explicitly enabled staging sandbox use.

## Decisions

- Confirmed: this integration keeps the approved Transactions-only profile scope; balances, identity, transfers, and production Plaid remain disabled.
- Confirmed: connection consent must be explicitly confirmed against a versioned server-provided notice before Link-token creation.
- No production credentials or user Plaid connection were configured by this change.

## Verification

- `npm run check` passed: 500 tests passed, 15 skipped, and 9 todo; 7 test files skipped.
- `git diff --check` passed.
- No live Supabase, Plaid, or hosted route call was made.

## Unresolved

- No signed-in staging user, deployed Vercel URL, Plaid sandbox credentials, or token-encryption key was available for end-to-end verification.
- The client sign-in/consent/Link interface remains absent under the repository's headless-first sequencing rule.
- Lifecycle expiration/revocation scheduling and production migration/rollout work remain outstanding; production Plaid stays disabled.
- The shared worktree contained pre-existing uncommitted memory, retention, and hosted-chat changes. They were preserved.

## Recommended Next Step

Configure the staging secrets and `PLAID_FINANCIAL_PROFILE_ENABLED=true`, then verify the signed-in consent-to-Link-to-profile flow against the deployed staging app before beginning client UI work.
