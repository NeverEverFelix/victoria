# Session: Durable Memory Learning And Review Follow-up

- Date: 2026-10-29
- Time: 22:14 America/New_York
- Status: Partial; code changes and local verification completed
- Scope: Continue addressing findings in the 2026-10-29 conversation architecture review, focusing on nonblocking memory learning, turn-understanding coordination, fallback observability, and local persistence verification.

## Outcome

Added a durable, identity-only memory-learning queue that defers optional provider extraction until the exact scoped source turn is completed. Extracted turn-understanding orchestration from `VictoriaAgent`, added content-free response retry/fallback traces, and scheduled the production worker using Vercel Cron's GET contract. Financial policy and mocked-ledger boundaries remain unchanged.

## Work Completed

- Added [migration 0028](../../db/migrations/0028_durable_memory_learning_queue.sql) and its matching Supabase migration. Jobs reference a turn ID and scoped user/conversation identity; the original text remains in `victoria_turns`. RLS and service-role grants restrict access.
- Added [PostgresMemoryLearningQueue](../../src/app/turns/memory-learning-queue.ts) with idempotent enqueue, completed-turn-only claims, expiring leases, bounded retries, and content-free failure codes.
- Added the [memory-learning processor](../../src/app/turns/memory-learning-processor.ts), [protected handler](../../src/app/http/memory-learning-handler.ts), and [Vercel route](../../app/api/cron/memory-learning/route.ts). Eligible turns enqueue asynchronously; user-facing replies do not wait for provider extraction.
- Wired queue and worker into persistent and local-persistent runtimes. Updated the staging authorization smoke script and memory/environment operations docs.
- Moved advisory interpretation validation and shadow comparison into [turn-understanding.ts](../../src/agent/turn-understanding.ts).
- Added [content-free reply traces](../../src/agent/conversation-reply-service.ts) for coarse route, retry count, validation rejection category, and fallback reason.
- Updated the F01–F08 crosswalk and [test plan](../../tests/test-plan.md) with evidence and remaining review gates.

## Decisions

- Confirmed safety boundary: model interpretation remains advisory. Money permissions, pending workflow identity, exact approval, and ledger mutations remain deterministic.
- Queue jobs hold only durable turn identity. The worker retrieves message content from the exact scoped completed turn.
- The production worker schedule is daily at 03:40 UTC, after memory retention at 03:30 UTC. This is compatible with Vercel Hobby scheduling limits; availability may lag by roughly a day. Review hosting plan and desired learning freshness before increasing cadence.
- No hosted migration, deployment, or real-money action was performed.

## Verification

- `npm run check`: passed; 98 test files passed, 9 skipped; 972 tests passed, 26 skipped, 9 todo. One pre-existing lint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:146` (`_observedThrough`).
- Local loopback migration runner applied migration 0028 to the local and integration databases.
- PostgreSQL-backed integration suite: 19 passed, including completed-turn queue gating and exactly-once processing.
- `git diff --check`: passed; local and Supabase copies of migration 0028 match.
- Current Vercel Cron docs confirm GET invocation, bearer `CRON_SECRET`, and once-daily minimum on Hobby; see [Managing Cron Jobs](https://vercel.com/docs/cron-jobs/manage-cron-jobs) and [Usage And Pricing](https://vercel.com/docs/cron-jobs/usage-and-pricing).

## Unresolved

- F02 remains partial: Financial Moment classification is still a distinct typed classifier call. A shared interpretation/classification provider contract and quality evidence are open.
- F04 remains partial: `VictoriaAgent` is still a large coordinator and needs more seam-by-seam extraction with parity tests.
- F05 fallback coverage for uncommon topics remains open, though retries and fallback categories are now observable.
- F06 blinded memory relevance scoring and hosted worker/outage parity remain open. The daily worker cadence has a known freshness tradeoff.
- F07 needs hosted multi-worker and database outage/recovery verification.
- F08 still needs human-blinded response scoring and approved latency/cost targets. Existing target values remain proposals.
- The human review packet remains unscored; do not treat local tests or provider replay scores as a substitute.

## Recommended Next Step

Continue code work on one remaining F04 seam or the F02 shared interpretation contract, preserving the existing financial policy gates. Before any release decision, complete the blind human review and verify the protected memory-learning route against the intended hosted environment.
