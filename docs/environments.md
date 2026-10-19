# Environments

Victoria should run with separate configuration, databases, and secrets for each environment.

The most important rule: never share databases or secrets between local, test, staging, and production.

## Environment Matrix

| Environment | Purpose | Database | AI | Banking | Money movement |
| --- | --- | --- | --- | --- | --- |
| `local` | Developer machine | `victoria_local` | mock by default; Financial Moment or full team opt-in | sandbox-only; explicit runtime opt-in required | `mock_ledger` |
| `test` | Automated tests | `victoria_test` or disposable DB | mock by default | mock; no financial data reads | `mock_ledger` |
| `staging` | Production-like validation | staging DB | mock by default; Financial Moment or full team opt-in | disabled | `mock_ledger` |
| `production` | Real users | production DB | mock by default; provider AI opt-in, full team off by default | disabled | `mock_ledger` |

## Local PostgreSQL With pgvector

The local development database uses the `pgvector/pgvector:pg15` container on loopback port 5433. This keeps it separate from a Homebrew PostgreSQL service on port 5432 and provides the vector extension required by migration `0004`. The Compose init script adds only the Supabase role names and `auth.uid()` shim needed to run the same migrations locally. Migrations `0010` through `0015` are local-only: `0010` stores short-lived amount clarifications, `0011` stores pending savings proposals, terminal transitions, and mocked ledger entries, `0012` stores approved goal allocations linked to mocked entries, `0013` stores pending goal-allocation proposals, approvals, and terminal outcomes, and `0014` stores approved savings-entry corrections as signed append-only adjustments; `0015` enforces same-user links, exact approval evidence, and safe-integer cents limits. These migrations have not been applied to hosted Supabase projects.

```bash
npm run db:local:up
cp .env.example .env.local
ALLOW_DB_MIGRATE=true npm run db:migrate
```

`npm run db:local:down` stops the container and preserves the named volume. The database is bound to `127.0.0.1`; do not expose this local-only database on a public interface. Set `VICTORIA_MEMORY_MODE=persistent` in ignored `.env.local` to use this database from the local chat route. The default remains mock memory. The example password is for loopback development only.

## Required Variables

```bash
APP_ENV=
NODE_ENV=
DATABASE_URL=
OPENAI_API_KEY=
OPENAI_MODEL=mock
OPENAI_FINANCIAL_MOMENT_ENABLED=false
OPENAI_AGENT_TEAM_ENABLED=false
OPENAI_MEMORY_EXTRACTION_ENABLED=false
PLAID_CLIENT_ID=
PLAID_SECRET=
PLAID_ENV=
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
- The mounted `/api/victoria/[conversationId]` chat route is enabled only for `APP_ENV=local` with `NODE_ENV=development` and a private random `AUTH_SECRET` of at least 32 bytes. It uses a signed bearer session and mock ledger tools. Memory defaults to process-local mock storage; `VICTORIA_MEMORY_MODE=persistent` opts into PostgreSQL-backed context and durable facts, still using the local signed-session boundary. Contextual extraction and episodic summaries stay disabled by default; they require `OPENAI_MEMORY_EXTRACTION_ENABLED=true`, a provider model, and `OPENAI_API_KEY`. That flag affects only memory extraction and summaries; classification and ledger tools remain mock-backed. No login/session issuer is mounted yet; a trusted login boundary must call the server-side session signer before clients can use this route. The route returns 503 in test, staging, and production. In local persistent mode, `GET /api/memories` reuses the signed local session and exposes only the authenticated user’s current memory facts; local memory correction is available through `PATCH /api/memories`, and single-fact forget is available through `POST /api/memories/{memoryId}/forget`; both append linked records through the same signed session.
- `OPENAI_MODEL=mock` keeps deterministic specialists active. The single provider-backed Financial Moment remains disabled unless `OPENAI_FINANCIAL_MOMENT_ENABLED=true`. Set `OPENAI_AGENT_TEAM_ENABLED=true` to opt into provider-backed Financial Moment, Savings Reasoning, and Companion Voice specialists. Both flags default to false; the complete-team flag takes precedence if both are set. All provider roles are advisory: deterministic validation, approval, ledger writes, and transfer refusal remain in the core.
- `OPENAI_MEMORY_EXTRACTION_ENABLED=false` by default. It is accepted only by the local development chat runtime and enables structured memory extraction plus episodic summaries using the configured OpenAI model; it does not enable provider-backed classification, savings tools, or money movement.
- The Plaid financial-profile runtime is an explicit server-side opt-in and accepts only `PLAID_ENV=sandbox`; it validates Plaid credentials and a base64-encoded 32-byte `PLAID_TOKEN_ENCRYPTION_KEY` before composing adapters. `tokenEncryptionKeyVersion` and `previousTokenEncryptionKeysBase64` are runtime factory options, not parsed environment variables; a deployment wrapper must load them from a secret manager. Prior keys decrypt existing envelopes but new writes use only the active key. Keep prior keys available until the lifecycle rotation operation has re-encrypted and verified every active and queued Item token. Production and development Plaid hosts are rejected. No default application route initializes the runtime.
- To run one local provider-team smoke turn, put a real key in ignored `.env.local`, set `OPENAI_MODEL` to a provider model, keep `MONEY_MOVEMENT_MODE=mock_ledger`, and set `OPENAI_AGENT_TEAM_ENABLED=true`. Then run `CONFIRM_LIVE_SMOKE=1 npm run agent:smoke:provider-team`. The command refuses CI execution, uses a synthetic avoided-spend message and mock memory/ledger tools, and sends no approval. It makes up to three provider calls and may incur charges. The test is skipped during ordinary `npm test` and `npm run check`.
- `PLAID_ENV=production` should not be used until banking reads and writes have separate audited adapters.
- The default runtime remains mock-backed. An explicit server-only Plaid financial-profile runtime is available for authenticated routes; it composes consent checks, environment-specific Link/API clients, encrypted Item-token storage, cursor sync, profile persistence, and embeddings. It is not mounted by default and has not been connected to live credentials or a Supabase project.
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
- `AUTH_SECRET` is used only by the local signed-session mock route. Production and staging chat routes remain unavailable; only memory-management API requests accept bearer tokens and verify user identity through Supabase Auth.
- Production provider credentials must not use obvious local, test, or example placeholder values.
- Persistent memory-management endpoints are mounted at paginated `GET/PATCH /api/memories` and `POST /api/memories/{memoryId}/forget`. Listing accepts `limit` (up to 100) and an opaque keyset `cursor`. They are enabled only in staging/production when `DATABASE_URL`, `OPENAI_API_KEY`, `SUPABASE_URL`, and `SUPABASE_PUBLISHABLE_KEY` are configured. They use PostgreSQL directly and a one-connection per-instance pool; use Supabase's connection pooler for Vercel deployments. Every memory statement runs in a short transaction after `SET LOCAL ROLE victoria_memory_api` and binds the verified Supabase subject to transaction-local RLS context. This non-login role has SELECT/INSERT access only to memory facts and embeddings; it cannot update or delete historical records.
- The app uses only Supabase's publishable key to verify bearer access tokens through Supabase Auth. Never put a Supabase secret/service-role key in browser code or use one for user-scoped memory APIs.
- The local migration runner intentionally refuses remote/production databases; use the Supabase CLI workflow below for remote schema changes.
- The repository keeps canonical SQL in `db/migrations/`; `supabase/migrations/` contains regular-file copies for Supabase CLI portability. When adding or changing a migration, keep the paired files identical and verify them with `cmp` before running `supabase migration list --linked` and `supabase db push --linked --dry-run`. As of 2026-10-18, migrations `0001`–`0008` are applied in both Supabase environments; `0009_memory_api_rls_role.sql` is applied and role privileges/RLS were verified in staging. Production still needs migration `0009` before the new runtime is deployed there. Keep local PostgreSQL for local development and tests; use the hosted staging database for Vercel previews. The shared pool factory accepts `maxPoolSize` from 1 through 20 (default 5); local memory-management handlers use 1 connection per warm instance. The persistent local conversation coordinator waits at most 30 seconds for a per-conversation lock.
- Forgetting is an append-only suppression action. It hides one fact from future retrieval and retains historical memory and embedding records. Physical deletion and bulk delete are not part of the current controls.
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
