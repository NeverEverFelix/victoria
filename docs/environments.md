# Environments

Victoria should run with separate configuration, databases, and secrets for each environment.

The most important rule: never share databases or secrets between local, test, staging, and production.

## Environment Matrix

| Environment | Purpose | Database | AI | Banking | Money movement |
| --- | --- | --- | --- | --- | --- |
| `local` | Developer machine | `victoria_local` | mock by default; Financial Moment or full team opt-in | sandbox-only isolated scaffolding | `mock_ledger` |
| `test` | Automated tests | `victoria_test` or disposable DB | mock by default | mock; no financial data reads | `mock_ledger` |
| `staging` | Production-like validation | staging DB | mock by default; Financial Moment or full team opt-in | disabled | `mock_ledger` |
| `production` | Real users | production DB | mock by default; provider AI opt-in, full team off by default | disabled | `mock_ledger` |

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
MONEY_MOVEMENT_MODE=
AUTH_SECRET=
```

## Money Safety Rules

- `local`, `test`, and `staging` should default to `MONEY_MOVEMENT_MODE=mock_ledger`.
- `production` should also use `MONEY_MOVEMENT_MODE=mock_ledger` until real transfers have been fully approved, audited, and tested.
- `production` cannot use real transfers during the MVP. A future audited release may revisit this boundary.
- The mounted `/api/victoria/[conversationId]` chat route is enabled only for `APP_ENV=local` with `NODE_ENV=development` and a private random `AUTH_SECRET` of at least 32 bytes. It uses a signed bearer session and process-local mock memory/ledger tools. Contextual extraction and episodic summaries stay disabled by default; they require `OPENAI_MEMORY_EXTRACTION_ENABLED=true`, a provider model, and `OPENAI_API_KEY`. That flag affects only memory extraction and summaries; classification and ledger tools remain mock-backed. No login/session issuer is mounted yet; a trusted login boundary must call the server-side session signer before clients can use this route. The route returns 503 in test, staging, and production.
- `OPENAI_MODEL=mock` keeps deterministic specialists active. The single provider-backed Financial Moment remains disabled unless `OPENAI_FINANCIAL_MOMENT_ENABLED=true`. Set `OPENAI_AGENT_TEAM_ENABLED=true` to opt into provider-backed Financial Moment, Savings Reasoning, and Companion Voice specialists. Both flags default to false; the complete-team flag takes precedence if both are set. All provider roles are advisory: deterministic validation, approval, ledger writes, and transfer refusal remain in the core.
- `OPENAI_MEMORY_EXTRACTION_ENABLED=false` by default. It is accepted only by the local development chat runtime and enables structured memory extraction plus episodic summaries using the configured OpenAI model; it does not enable provider-backed classification, savings tools, or money movement.
- To run one local provider-team smoke turn, put a real key in ignored `.env.local`, set `OPENAI_MODEL` to a provider model, keep `MONEY_MOVEMENT_MODE=mock_ledger`, and set `OPENAI_AGENT_TEAM_ENABLED=true`. Then run `CONFIRM_LIVE_SMOKE=1 npm run agent:smoke:provider-team`. The command refuses CI execution, uses a synthetic avoided-spend message and mock memory/ledger tools, and sends no approval. It makes up to three provider calls and may incur charges. The test is skipped during ordinary `npm test` and `npm run check`.
- `PLAID_ENV=production` should not be used until banking reads and writes have separate audited adapters.
- The default runtime remains mock-backed. An explicit server-only Plaid financial-profile runtime is available for authenticated routes; it composes consent checks, environment-specific Link/API clients, encrypted Item-token storage, cursor sync, profile persistence, and embeddings. It is not mounted by default and has not been connected to live credentials or a Supabase project.
- The local mock chat runtime exposes a profile writer backed by the same user-scoped transaction-history provider as its agent. Injected/mock profile refreshes therefore affect subsequent local chat estimates; this is process-local and does not mount or call Plaid.
- Set `PLAID_TOKEN_ENCRYPTION_KEY` only in a secret manager when deploying that explicit runtime. It must be base64 for a randomly generated 32-byte key. Never commit it. Key rotation/versioning and an Item disconnect/deletion lifecycle remain deployment follow-ups.
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
- Production `AUTH_SECRET` must be at least 32 characters.
- Production provider credentials must not use obvious local, test, or example placeholder values.
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
