# Session: Memory Lifecycle And Operations

- Date: 2026-10-21
- Time: 16:40 America/New_York
- Status: Partial
- Scope: Define physical retention for memory/context data, add auditable scheduled cleanup and recovery guidance, and verify hosted staging migrations.

## Outcome

Defined concrete retention windows and implemented PostgreSQL cleanup for expired context, stale conversational facts, forgotten memory lineages, embeddings, and existing 90-day Plaid profile data. Added a secret-protected daily maintenance route, run audit table, local SQLite outbox retry/sweep behavior, and logical expiry at read time. Applied migrations 0010–0019 to linked Victoria Staging.

## Work Completed

- Added [migration 0018](../../db/migrations/0018_memory_retention_and_operations.sql) with `victoria_run_memory_retention()` and restricted `victoria_retention_runs` audit records.
- Added [migration 0019](../../db/migrations/0019_expire_stale_memory_recall.sql) so semantic retrieval excludes ordinary facts past 24 months even if cleanup is delayed.
- Added the secret-protected [retention handler](../../src/app/http/memory-retention-handler.ts), [route](../../app/api/cron/memory-retention/route.ts), and daily production schedule in [vercel.json](../../vercel.json). The route logs only structured event/count metadata.
- Local SQLite cache and outbox now sweep expiry every minute and retry still-live backup rows every minute; expired rows are removed on startup and context access too.
- Updated forget responses to describe the 30-day recovery window before physical purge of the linked fact lineage and embeddings.
- Added retention policy, runbook, recovery/query examples, deployment variables, user story, and test-plan updates in [operations guide](../operations/memory-lifecycle-and-recovery.md), [schema specification](../specification/user-learning-schema.md), [environment guide](../environments.md), and related docs.
- The shared worktree still contains uncommitted files from the preceding hosted chat and learning-policy sessions; those changes were not reverted or represented as new lifecycle work.

## Decisions

- Confirmed: unforgotten conversational facts expire after 24 months without a newer linked revision; forget suppresses immediately and physically purges the lineage plus embeddings after 30 days.
- Confirmed: transaction source/profile data retain their 90-day window; PostgreSQL context expires after 30 minutes; local cache/outbox has the same TTL and recurring retry/sweep behavior.
- Confirmed: financial decisions, approvals, and ledger history keep their separate immutable lifecycle.
- Backup copies may remain until provider retention expires. The expected maximum residual-copy period is 60 days after forget only if the project's Supabase backup/PITR retention is confirmed at no more than 30 days.

## Verification

- Applied local migrations through 0019 with the guarded loopback-only migration runner.
- Created a disposable pgvector PostgreSQL database, applied migrations, and passed the persistent-chat integration suite: 11 tests.
- Applied migrations 0010–0019 to the linked `Victoria Staging` project. `supabase migration list --linked` showed 0001–0019 aligned.
- Preflight showed zero staging rows due for context/fact/profile deletion. Invoked the retention function once; it returned `succeeded` with zero deletions and created an audit row.
- Verified staging anonymous memory read returned zero rows, memory API role has SELECT/INSERT but no UPDATE/DELETE, the retention function is executable by `service_role`, and semantic search contains the 24-month cutoff.
- `npm run check` passed: 493 tests passed, 15 skipped, and 9 todo. The existing `_observedThrough` lint warning and experimental SQLite runtime warnings remain.
- `git diff --check` passed; paired migrations 0018/0019 compared identical.

## Unresolved

- No Vercel CLI/project link, deployed app URL, or signed-in staging test user was available. Authenticated hosted chat/memory endpoint behavior and a live cron HTTP invocation remain unverified.
- Supabase backup/PITR retention was not inspected in the Dashboard; the 60-day residual-copy statement remains conditional on configuring no more than 30 days.
- A staging scheduler is not configured. Vercel Cron runs for production deployments; staging needs an approved external schedule.
- Structured logs and database audit rows exist, but no log drain or alert destination is configured. Set alerts for failed runs, no success within 48 hours, and unexpected deletion spikes.
- Production migrations 0009–0019 remain unapplied.

## Recommended Next Step

Configure Vercel staging and a trusted signed-in test user, verify chat and memory controls end-to-end, run the staging cron route with `CRON_SECRET`, confirm the Supabase backup/PITR window in the Dashboard, and wire the documented alerts before enabling production maintenance.
