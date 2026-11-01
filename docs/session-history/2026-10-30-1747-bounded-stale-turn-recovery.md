# Session: Bounded stale-turn recovery

- Date: 2026-10-30
- Time: 17:47 EDT
- Status: Partial
- Scope: Extend atomic approved-action receipts with bounded discovery and safe recovery of stale persistent chat turns.

## Outcome

Persistent chat now has a bounded stale-turn recovery path. A stale turn with a valid same-transaction action receipt is finalized without re-running the agent. An older turn without a receipt is marked `worker_interrupted`; the worker never blindly replays a potentially duplicated operation. The restricted receipt builder has also been extracted from `VictoriaAgent` and has focused scope/payload tests.

## Work Completed

- Added [`stale-turn-recovery.ts`](../../src/app/turns/stale-turn-recovery.ts), bounded stale-running queries for the in-memory and PostgreSQL repositories, and receipt finalization in the queue processor and authenticated result polling path.
- Added the authenticated `/api/cron/turn-recovery` route, daily 03:50 UTC schedule, and partial stale-turn index migration `0029` with matching Supabase migration. The daily schedule respects Vercel Hobby's daily cron limit; more frequent execution needs an eligible hosting plan.
- Kept `result_payload` as the receipt store, with approved savings entry, entry correction, or goal allocation receipt committed in the same PostgreSQL transaction as its mock-ledger mutation.
- Added unit coverage for stale query bounds, receipt finalization, unreceipted interruption, fresh-turn exclusion, route authentication, and polling recovery. Added PostgreSQL integration scenarios for post-action crash recovery and pre-action interruption. Extracted receipt construction into [`turn-action-receipt-builder.ts`](../../src/agent/turn-action-receipt-builder.ts) with tests proving owner/turn scope, default conversation scope, and the minimized recovery payload; updated the F04 crosswalk.
- Updated [`tests/test-plan.md`](../../tests/test-plan.md), [`docs/environments.md`](../environments.md), and the [architecture review crosswalk](../architecture/conversation-architecture-spec-follow-up-2026-10-29.md).

## Decisions

- The recovery worker finalizes exact stored action receipts and never re-invokes agent logic for a stale turn.
- A stale unreceipted turn is surfaced as interrupted instead of automatically replayed. This avoids duplicate proposals or other partial effects when the crash point is unknown.
- The scheduled route is daily at 03:50 UTC. Vercel Hobby only supports daily cron execution; increasing frequency requires a hosting plan that allows it.
- The additive migration was applied only to the isolated local `victoria_integration_local` database. No hosted database was changed and no deployment occurred.

## Verification

- `npm run check` — passed: 121 test files passed, 9 skipped; 1,089 tests passed, 29 skipped, 9 todo. Agent validation, lint, and source/test type checks are included in the command.
- Isolated loopback PostgreSQL integration suite — passed, 22/22.
- `git diff --check` — passed.
- Node emitted existing SQLite experimental-feature warnings during the test run.

## Unresolved

- Turns interrupted before an approved persistent mutation remain marked failed and need a safe product/operational retry policy; they are not automatically re-run.
- Hosted PostgreSQL outage/recovery and deployed multi-worker parity have not been verified.
- F04 remains partial: `VictoriaAgent` still needs seam-by-seam extraction with parity coverage.
- Blinded human scoring remains outstanding. The live provider evaluation report exists, but this session did not run paid provider calls or human review.
- The worktree contains a large uncommitted set of prior architecture-review changes; this entry records only this recovery slice.

## Recommended Next Step

Review F04 and the remaining F01/F05 behavior against the crosswalk, then take one small tested extraction or fallback-quality gap at a time. Keep hosted outage/multi-worker and human scoring as explicit external verification gates; do not mark the full review closed until those gates are resolved or formally accepted.
