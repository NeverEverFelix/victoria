# Memory Lifecycle And Recovery Runbook

## Retention Contract

| Data | Availability window | Physical cleanup |
| --- | --- | --- |
| Transaction source rows and derived profile facts/embeddings | 90 days from observation/transaction date | Retention job deletes expired source rows and derived profile lineage together. |
| Explicit conversational facts and linked revisions | 24 months from the latest revision | Reads stop recalling the fact at cutoff; retention job deletes the whole revision lineage and all embeddings. |
| User-forgotten conversational fact | Suppressed from retrieval immediately | The fact, suppression record, linked lineage, and embeddings are deleted after 30 days. |
| PostgreSQL chat context | 30 minutes since last turn | Daily scheduled job deletes expired rows, normally within 24.5 hours after expiry. Reads reject expired rows even before cleanup. |
| Local SQLite context cache and outbox | 30 minutes since last turn | Swept every minute, on context access, and when the provider starts. A queued backup retries every minute while live and is never flushed after expiry. |
| Financial decisions, approvals, and ledger history | Existing append-only product policy | Not deleted by the memory-retention job. |
| Supabase database backups | Provider configured retention | Set to no more than 30 days and verify in the Supabase dashboard. Deleted rows can remain in backups until those snapshots expire. |

The longest residual copy window after a forget request is 60 days: up to 30 days until primary purge, then up to 30 days until the last backup containing that row expires. This assumes the project backup/PITR setting is actually capped at 30 days. Do not claim deletion is complete until primary purge succeeds and the backup window has elapsed.

Vercel Cron runs only on production deployments. The code schedules `/api/cron/memory-retention` daily at 03:30 UTC; configure `CRON_SECRET` as a random secret of at least 32 bytes in production. Use a separate approved scheduler for staging. Vercel's cron invocation timing is best effort, not a hard execution-time guarantee. See [Vercel Cron security and scheduling](https://vercel.com/docs/cron-jobs/manage-cron-jobs) and [Supabase backup retention](https://supabase.com/docs/guides/platform/backups).

## Monitoring

The route emits structured `memory_retention_completed` or `memory_retention_failed` log events without user or memory content. Each SQL attempt is recorded in `victoria_retention_runs` with status, completion time, and deletion counts. Configure an alert when the latest run is failed or when no successful run has completed in 48 hours. Alert if deletion counts unexpectedly spike; inspect the database counts before rerunning because successful deletes are irreversible after backup expiry. No log-drain/alert destination is configured in this repository yet.

Check recent job history:

```sql
SELECT id, started_at, completed_at, status, deleted_context_rows,
       deleted_memory_rows, deleted_embedding_rows, deleted_profile_rows, error_code
FROM victoria_retention_runs
ORDER BY id DESC
LIMIT 20;
```

Check the latest-success age:

```sql
SELECT now() - max(completed_at) AS age_since_last_success
FROM victoria_retention_runs
WHERE job_name = 'memory_retention' AND status = 'succeeded';
```

## Recovery

1. If the retention route returns 401, verify the Vercel `CRON_SECRET` value and redeploy; never disable route authentication.
2. If it returns 503, inspect the matching run row and Vercel structured log. Fix connectivity, permissions, or schema issues, then rerun the same endpoint. The job is idempotent; a failed SQL subtransaction leaves the data unchanged and records the SQLSTATE only.
3. If Supabase is unavailable, chat and durable memory writes fail closed with 503. Semantic retrieval can fall back to bounded recent facts when embeddings are unavailable; it must not bypass user scoping.
4. For data loss, restore a Supabase backup to a separate recovery project first. Verify RLS, role grants, and migration parity, then run retention there. Do not restore over production until the recovered project has passed read-only checks and a controlled chat/memory smoke test.
5. After any restore, reapply migrations through the reviewed Supabase CLI workflow, verify `supabase migration list --linked`, run the retention function, and verify memory role/RLS contracts before reopening traffic. A restore may resurrect forgotten or expired rows from its snapshot.

## Deployment Verification

The staging project is linked locally. Migrations 0001–0019 have been applied and listed as equal in local/remote history. The retention SQL routine was invoked once on staging after preflight counts showed zero eligible rows, and it returned `succeeded` with zero deletions. No authenticated staging chat/memory endpoint smoke test or Vercel Cron invocation was possible without a deployed URL and signed-in test-user token. Verify those before rollout; also confirm the selected Supabase plan's actual backup/PITR retention in the dashboard.

### Hosted authorization smoke check

The authorization contract is owner based: a verified Supabase user may access only that user's conversations, memories, pending actions, and mocked ledger state. The MVP has no admin role or cross-user support role. Authentication establishes the subject; every operation must use that subject as its authorization scope. Memory management adds transaction-local RLS scope under the restricted `victoria_memory_api` role. Retention is a separate operator capability protected by `CRON_SECRET`.

After deploying the current code to staging, obtain short-lived access tokens for two distinct staging test users and export these variables in a private shell (never commit them or paste them into logs):

```bash
export VICTORIA_STAGING_URL='https://your-staging-host'
export VICTORIA_STAGING_CONFIRM='I_CONFIRM_STAGING'
export VICTORIA_STAGING_USER_A_TOKEN='…'
export VICTORIA_STAGING_USER_B_TOKEN='…'
export SUPABASE_URL='https://your-project.supabase.co'
export SUPABASE_PUBLISHABLE_KEY='…'
export CRON_SECRET='…'
npm run verify:staging:authorization
```

The script verifies both tokens with Supabase Auth and refuses to proceed if they identify the same user. It exercises authenticated chat and memory listing, learns a synthetic preference in one conversation and verifies recall in a second, checks user B cannot access or mutate user A's records, corrects and forgets the synthetic memory as user A, and confirms forgotten facts disappear from the current listing. It also verifies that the retention route rejects anonymous requests and that a request with `CRON_SECRET` completes an audited retention run. The run invokes real retention against staging and may purge data already past its documented retention window; first inspect the retention-eligibility counts and use disposable staging accounts. The synthetic savings proposal is declined at the end and does not move real money. If the run stops before that final step, user A can send `no` to the printed conversation ID to clear the pending mocked proposal. The script prints response statuses and assertions only; it does not print tokens, memory values, or response bodies.

Run this against two disposable staging test accounts and a currently deployed build. The runner writes, corrects, and forgets one synthetic preference on user A; forgetting suppresses it immediately and its stored lineage is purged after the 30-day recovery period. This smoke check does not replace review of Supabase role grants/RLS, migration parity, database isolation, backup retention, or the staging retention schedule.
