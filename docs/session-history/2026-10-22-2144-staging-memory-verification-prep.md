# Session: Staging Memory Verification Preparation

- Date: 2026-10-22
- Time: 21:44 America/New_York
- Status: Partial
- Scope: Prepare the hosted staging verification requested for authenticated chat, cross-conversation memory, memory controls, and retention.

## Outcome

Extended the staging smoke runner to exercise the missing same-user memory lifecycle and cross-conversation recall paths. Live hosted verification could not run because this shell has no staging URL, test-user tokens, Supabase public settings, or retention secret. The linked staging database remains reachable and migrations 0001–0019 match local history; migration 0020 is local only.

## Work Completed

- Extended [the staging smoke runner](../../scripts/verify-hosted-authorization.mjs) to verify a preference learned in one conversation is recalled in another, user A can correct and forget the test fact, the fact disappears from current listing immediately, user B cannot mutate user A's current fact, and the retention endpoint rejects anonymous requests and records a successful authorized run.
- Updated [the lifecycle runbook](../operations/memory-lifecycle-and-recovery.md) with `CRON_SECRET`, the expanded flow, and the effects of running real retention on staging.
- Queried the linked staging schema read-only. Migration history is aligned for 0001–0019; local migration 0020 is not applied to staging.
- Read-only retention preflight found zero expired context rows and zero conversational memory lineages eligible for purge.
- Confirmed the app currently exposes a Supabase sign-in UI for the Plaid connection experience, but no ChatGPT-style chat UI. The smoke runner verifies supplied access tokens with Supabase Auth; it does not exercise the visual sign-in form.

## Decisions

- Confirmed: run the smoke checks only against the currently deployed staging app and disposable staging users.
- Confirmed: the retention smoke invokes the real staging retention route; inspect preflight counts first because eligible retained data may be physically deleted.
- Pending: whether migration 0020 should be applied/deployed before the hosted run. The memory and retention paths target schema through 0019, but the currently deployed application revision has not been identified.

## Verification

- `supabase migration list --linked` — migrations 0001–0019 match; local migration 0020 is pending remotely.
- Read-only staging preflight — 0 expired context rows, 0 eligible memory lineages.
- `node --check scripts/verify-hosted-authorization.mjs` — passed.
- `git diff --check` — passed.
- `npm run check` — passed; 65 test files passed, 7 skipped; 556 tests passed, 15 skipped, 9 todo. Existing ESLint warning at `tests/unit/agent/memory-orchestrator.test.ts:112` and Node SQLite experimental warnings remain.
- Hosted HTTP checks and interactive sign-in were not run; staging URL/browser session and short-lived credentials are not available in this environment.

## Unresolved

- Configure `VICTORIA_STAGING_URL`, `VICTORIA_STAGING_CONFIRM`, `VICTORIA_STAGING_USER_A_TOKEN`, `VICTORIA_STAGING_USER_B_TOKEN`, `SUPABASE_URL`, `SUPABASE_PUBLISHABLE_KEY`, and `CRON_SECRET` locally; do not paste tokens or secrets into chat.
- Identify the staging deployment revision and decide migration 0020 parity before interpreting any server behavior.
- Exercise the hosted login form in a staging browser session, then run `npm run verify:staging:authorization` and inspect the recorded retention row.
- Confirm staging retention scheduling and configured database-backup retention; a successful one-off run does not verify scheduler configuration.

## Recommended Next Step

Supply staging access through local environment variables and the staging URL. Confirm the deployed revision and migration parity, then run the expanded smoke runner against two disposable test accounts and inspect the retention audit row.
