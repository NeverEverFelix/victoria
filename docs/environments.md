# Environments

Victoria should run with separate configuration, databases, and secrets for each environment.

The most important rule: never share databases or secrets between local, test, staging, and production.

## Environment Matrix

| Environment | Purpose | Database | AI | Banking | Money movement |
| --- | --- | --- | --- | --- | --- |
| `local` | Developer machine | `victoria_local` | configured provider for product chat | sandbox-only; explicit runtime opt-in required | `mock_ledger` |
| `test` | Automated tests | `victoria_test` or disposable DB | mock by default | mock; no financial data reads | `mock_ledger` |
| `staging` | Production-like validation | staging DB | configured provider for chat | disabled | `mock_ledger` |
| `production` | Real users | production DB | configured provider for chat | disabled | `mock_ledger` |

## Local PostgreSQL With pgvector

The local development database uses the `pgvector/pgvector:pg15` container on loopback port 5433. This keeps it separate from a Homebrew PostgreSQL service on port 5432 and provides the vector extension required by migration `0004`. The Compose init script adds only the Supabase role names and `auth.uid()` shim needed to run the same migrations locally. Migrations `0010` through `0015` were initially developed locally and hold durable chat state: `0010` stores short-lived amount clarifications, `0011` stores pending savings proposals, terminal transitions, and mocked ledger entries, `0012` stores approved goal allocations linked to mocked entries, `0013` stores pending goal-allocation proposals, approvals, and terminal outcomes, and `0014` stores approved savings-entry corrections as signed append-only adjustments; `0015` enforces same-user links, exact approval evidence, and safe-integer cents limits. Migrations `0010`–`0019` are now applied to the linked staging Supabase project; production remains pending. Migration `0016_server_only_table_access.sql` applies in all environments and enables RLS while restricting turn and Plaid consent tables to trusted server roles, and narrows the memory API role to SELECT/INSERT policies.

```bash
npm run db:local:up
cp .env.example .env.local
ALLOW_DB_MIGRATE=true npm run db:migrate
```

Hosted memory retention is scheduled by the Vercel production cron in `vercel.json` at 03:30 UTC daily. Set a random `CRON_SECRET` of at least 32 bytes in the deployment environment. Staging has no Vercel Cron execution; invoke the protected route through an approved external scheduler or manually during verification. The SQL routine records every result in `victoria_retention_runs`; alert on a failed run or no successful run for 48 hours. Cron timing is best-effort, so logical expiration takes effect at read time while physical cleanup runs on schedule.

`npm run db:local:down` stops the container and preserves the named volume. The database is bound to `127.0.0.1`; do not expose this local-only database on a public interface. With `DATABASE_URL` configured, the local chat route uses this database automatically for context, memory, pending actions, and mocked ledger entries. The example password is for loopback development only.

## Required Variables

In local persistent mode, a non-placeholder `OPENAI_API_KEY` enables pgvector embedding writes and semantic queries through `text-embedding-3-small` (or `OPENAI_EMBEDDING_MODEL`). This may send compact memory text and the current retrieval query to OpenAI. Without a real key, local persistent memory keeps its bounded recent-fact fallback. The embedding model must remain 1536-dimensional to match the current pgvector column.

```bash
APP_ENV=
NODE_ENV=
DATABASE_URL=
OPENAI_API_KEY=
OPENAI_MODEL=
OPENAI_EMBEDDING_MODEL=text-embedding-3-small
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=
PLAID_FINANCIAL_PROFILE_ENABLED=false
PLAID_TOKEN_ENCRYPTION_KEY=
MONEY_MOVEMENT_MODE=
AUTH_SECRET=
SUPABASE_URL=
SUPABASE_PUBLISHABLE_KEY=
```

## Money Safety Rules

- `local`, `test`, and `staging` should default to `MONEY_MOVEMENT_MODE=mock_ledger`.
- `production` should also use `MONEY_MOVEMENT_MODE=mock_ledger` until real transfers have been fully approved, audited, and tested.
- `production` cannot use real transfers during the MVP. A future audited release may revisit this boundary.
- The local chat route requires a signed session and always keeps ledger tools mocked. With a configured `DATABASE_URL`, it uses PostgreSQL for conversation memory, pending actions, and mocked ledger entries. A real `OPENAI_API_KEY` and `OPENAI_MODEL` automatically activate provider financial understanding and ordinary conversation. Staging and production use Supabase Auth and PostgreSQL under the same mocked-money boundary. Missing or unsafe runtime configuration returns 503.
- Mock language adapters are retained for headless tests. Product chat uses the configured provider automatically; provider text cannot approve actions, create ledger entries, or move real money.
- Ordinary conversation responses receive recent dialogue and relevant memories. They have no tool authority and are discarded if they claim a financial action or invent a dollar amount.
- Provider memory extraction and episodic summaries run automatically with valid provider credentials. Extracted memories still require direct user evidence, confidence, stability, and sensitivity checks. Summaries run on conversation finish or context rollover. Failure of optional memory processing does not approve or record anything.
- `PLAID_FINANCIAL_PROFILE_ENABLED=false` by default. Setting it to `true` enables the authenticated Plaid API routes only in `APP_ENV=staging`, and only with `PLAID_ENV=sandbox`, Supabase Auth configuration, valid Plaid credentials, and a base64-encoded 32-byte `PLAID_TOKEN_ENCRYPTION_KEY`. Production and local routes do not initialize this runtime. The `/` client journey provides Supabase email/password sign-in, the server-provided consent disclosure, explicit consent, Plaid Link, aggregate profile summaries, and disconnect/delete confirmation; the Link flow remains unavailable unless the notice is Transactions-only with balances and transfers disabled. It depends on the staging API routes described above and still needs deployed signed-in verification. Requests derive identity from verified Supabase Auth, and consent scope is fixed to Transactions for the financial profile. `tokenEncryptionKeyVersion` and `previousTokenEncryptionKeysBase64` remain runtime factory options; a deployment wrapper must load rotation keys from a secret manager. Prior keys decrypt existing envelopes but new writes use only the active key. Keep prior keys until rotation verifies all active and queued Item tokens.
- The opt-in provider-team smoke uses a synthetic message and mocked ledger tools; it does not approve an action. Set `CONFIRM_LIVE_SMOKE=1` before running `npm run agent:smoke:provider-team` because it makes provider calls.
- `PLAID_ENV=production` should not be used until banking reads and writes have separate audited adapters.
- The default runtime remains mock-backed. The explicit Plaid profile runtime is mounted only in staging when `PLAID_FINANCIAL_PROFILE_ENABLED=true`; it composes consent checks, sandbox Link/API clients, encrypted Item-token storage, cursor sync, profile persistence, and embeddings. It is not enabled by default and has not been verified through deployed routes. Production Plaid behavior remains disabled.
- The local mock chat runtime exposes a profile writer backed by the same user-scoped transaction-history provider as its agent. Injected/mock profile refreshes therefore affect subsequent local chat estimates; this is process-local and does not mount or call Plaid.
- Set `PLAID_TOKEN_ENCRYPTION_KEY` and any prior-version keys only in a secret manager when deploying that explicit runtime. Each must be base64 for a randomly generated 32-byte key. Never commit keys. Disconnect/delete-all clears local tokens, transactions, and Plaid-derived facts before requesting remote revocation; retryable failures retain only encrypted tokens in a backoff queue, while permanent provider rejections remain encrypted for manual review. Schedule the exposed expiration and revocation-retry operations and provide an operator path for manual-review records before enabling live reads. Do not retire a prior key until a rotation run reports all persisted tokens verified.
- Plaid data handling is limited to Transactions for the financial profile. No transfers, balances, identity, or other products are enabled.
- Victoria must never treat a mocked ledger entry as real moved money.
- Real banking integrations should be isolated behind tool contracts.
- Failed real transfer attempts must not create completed savings entries.

## Parser Safety Rules

The config parser enforces the most important environment boundaries:

- `APP_ENV=local` requires `NODE_ENV=development`.
- `APP_ENV=test` requires `NODE_ENV=test`.
- `APP_ENV=staging` requires `NODE_ENV=production`.
- `APP_ENV=production` requires `NODE_ENV=production`.
- `DATABASE_URL` must use `postgresql://` or `postgres://`.
- `DB_SSL=true` enables TLS with certificate verification for the migration runner and explicit PostgreSQL turn-store factory; use `false` only for trusted local/test PostgreSQL.
- `npm run db:migrate` requires `ALLOW_DB_MIGRATE=true`, a matching local/development or test/test environment pair, a loopback database host, and a database name ending in `_local` or `_test`. Production migrations require a separately reviewed deployment process.
- Production `DATABASE_URL` must not point to `localhost`, `127.0.0.1`, or `0.0.0.0`.
- Production `DATABASE_URL` must not use example hosts or placeholder passwords.
- Local, test, staging, and production database names must not be reused across environments.
- `AUTH_SECRET` is used only by the local signed-session mock route. Staging and production chat and memory routes verify bearer access tokens through Supabase Auth; identity comes from the verified subject.
- Production provider credentials must not use obvious local, test, or example placeholder values.
- Staging/production chat is mounted at `POST /api/victoria/{conversationId}` and uses a PostgreSQL-backed runtime with direct durable context, semantic memory, pending-action, and mock-ledger storage. It requires the same `DATABASE_URL`, `OPENAI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY` configuration as memory controls, and keeps `MONEY_MOVEMENT_MODE=mock_ledger`. Persistent memory-management endpoints are mounted at paginated `GET/PATCH /api/memories` and `POST /api/memories/{memoryId}/forget`. Listing accepts `limit` (up to 100) and an opaque keyset `cursor`. They are enabled only in staging/production when `DATABASE_URL`, `OPENAI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY` are configured. They use PostgreSQL directly and a one-connection per-instance pool; use Supabase's connection pooler for Vercel deployments. Every memory statement runs in a short transaction after `SET LOCAL ROLE victoria_memory_api` and binds the verified Supabase subject to transaction-local RLS context. This non-login role has SELECT/INSERT access only to memory facts and embeddings; it cannot update or delete historical records.
- Memory routes send the user's bearer token to the Supabase Auth user endpoint with the publishable/anon API key; Supabase Auth validates the bearer token and returns the verified identity. The publishable/anon key is not itself a token verifier. Never put a Supabase secret/service-role key in browser code or use one for user-scoped memory APIs.
- The local migration runner intentionally refuses remote/production databases; use the Supabase CLI workflow below for remote schema changes.
- Migration `0021_persist_pending_entry_corrections.sql` adds append-only pending correction proposals and terminal outcomes. It was applied to the configured loopback `victoria_local` database on 2026-10-25; staging and production still need the migration before enabling the updated hosted runtime.
- The repository keeps canonical SQL in `db/migrations/`; `supabase/migrations/` contains regular-file copies for Supabase CLI portability. When adding or changing a migration, keep the paired files identical and verify them with `cmp` before running `supabase migration list --linked` and `supabase db push --linked --dry-run`. As of 2026-10-21, migrations `0001`–`0019` are applied and listed in the linked Victoria Staging project; the 0018 retention routine returned a successful zero-delete smoke result. Production still needs migrations `0009`–`0019` applied and verified before the hosted runtime is enabled there. Keep local PostgreSQL for local development and tests; use the hosted staging database for Vercel previews. The shared pool factory accepts `maxPoolSize` from 1 through 20 (default 5); local memory-management handlers use 1 connection per warm instance. The persistent local conversation coordinator waits at most 30 seconds for a per-conversation lock.
- Forgetting suppresses a fact immediately and appends a marker; the scheduled job physically deletes the forgotten lineage and embeddings after a 30-day recovery window. Bulk delete is not part of the current controls.
- Lifecycle policy: transaction-derived source rows and profile facts/embeddings expire after 90 days; explicit conversational facts and their linked revision lineage expire 24 months after the latest revision; a user-forgotten fact is suppressed immediately and its lineage plus embeddings are physically removed after a 30-day recovery window. Reads stop recalling ordinary facts at their 24-month cutoff even if cleanup is delayed. Short-term conversation context is unreadable after 30 minutes and physically swept by the daily job (up to about 24.5 hours after expiry). Local SQLite cache/outbox rows carry the same 30-minute expiry, retry every minute while live, and are swept every minute, on access, and at startup. Financial decision/ledger/approval history remains under its existing immutable policy.
- Supabase database backups are provider-managed and may retain a deleted row until the backup containing it expires. Set and verify the project backup/PITR retention to at most 30 days; the maximum residual copy window is then 30 days after primary purge, or up to 60 days after a forget request. A database restore may reintroduce expired data; rerun migrations and the retention job before reopening traffic.
- `MONEY_MOVEMENT_MODE=real_transfer` is rejected in every environment during the MVP.

## Suggested Files

```text
.env.example
.env.test.example
.env.staging.example
.env.production.example
.env.local          # ignored, local secrets
.env.test           # ignored, test secrets
.env.staging        # managed by hosting provider
.env.production     # managed by hosting provider
```

Only example files should be committed. Real `.env.local`, `.env.test`, `.env.staging`, and `.env.production` files must stay uncommitted.

## Specific Setup Status

- `local`: represented by `.env.example`.
- `test`: represented by `.env.test.example`.
- `staging`: represented by `.env.staging.example`; real values should live in the hosting provider.
- `production`: represented by `.env.production.example`; real values should live in the hosting provider.

## Deployment Shape

Recommended early setup:

- Local: developer machine.
- Test: CI runner.
- Staging: Vercel preview or separate staging project.
- Production: Vercel production project.

Recommended database setup:

- Local: local Postgres or a local-only cloud branch.
- Test: disposable or resettable database.
- Staging: separate Neon or Supabase project/branch.
- Production: separate Neon or Supabase project/branch.
