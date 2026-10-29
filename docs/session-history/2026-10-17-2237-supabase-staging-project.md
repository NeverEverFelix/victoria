# Session: Supabase Staging Project

- Date: 2026-10-17
- Time: 22:37 America/New_York
- Status: Partial
- Scope: Create a separate hosted Supabase staging project, apply the canonical Victoria migrations, and prepare for Vercel preview deployment.

## Outcome

Created `Victoria Staging` in the Victoria organization in `us-east-1`, kept the existing Supabase project as production, and applied migrations `0001`–`0008` to staging. Local PostgreSQL remains the local/test database; the hosted staging database is intended for Vercel previews. The Vercel account is not authenticated in this environment, so deployment and endpoint-level live tests remain pending.

## Work Completed

- Created staging project `ilqosffyojjfuerpocmh`. Its generated database password was stored in macOS Keychain under service `victoria-supabase-staging-db-password`; it was not printed or written to the repository.
- Linked the repository to the staging project and applied all eight migrations through Supabase CLI, using the symlinked canonical files from [db/migrations](../../db/migrations/).
- Verified the local and remote migration histories match at `0001`–`0008`.
- Queried staging to verify RLS is enabled with one owner policy each on memories, embeddings, decisions, and conversation context; verified the forget-aware search function exists.
- Updated [environments.md](../environments.md), [agent-work-queue.md](../agent-work-queue.md), and [decisions.md](../decisions.md) with the production/staging split and verification state.
- Checked Vercel CLI via `npx vercel@latest`; CLI version 64.5.0 is available, but `whoami` reports logged out. No Vercel project was created or deployed.

## Decisions

- Confirmed: the existing Victoria Supabase project is production; the new hosted Supabase project is staging.
- Confirmed: use local PostgreSQL for local development and automated tests, and the hosted staging database for Vercel previews.
- Confirmed: staging tests must use synthetic accounts and avoid writing test data to production.
- The staging project was created without specifying a compute size. Its actual organization plan, billing, and compute settings still need review in Supabase.

## Verification

- `supabase db push --linked --dry-run` listed all eight migrations as pending on staging.
- `supabase db push --linked --yes` completed successfully.
- `supabase migration list --linked` showed local and remote versions `0001`–`0008` aligned.
- Remote SQL confirmed all four memory/context tables have RLS and one owner policy each; the forget-aware semantic search function exists.
- `git diff --check` passed. No application tests were run because this slice changed deployment configuration and remote schema only.

## Unresolved

- Vercel is not authenticated or linked; no Vercel project or preview deployment exists.
- Vercel preview variables need the staging database pooler URL/password, staging Supabase URL and publishable key, and an OpenAI API key for embedding generation.
- Supabase Auth sign-in/test-user setup and live authenticated endpoint tests remain pending.
- Verify staging billing/compute and ensure production-only secrets remain scoped to production.
- Persistent chat, durable pending approvals, rate limiting, monitoring, and the user-facing memory UI remain outside this staging setup.

## Recommended Next Step

Authenticate Vercel CLI with the intended account, then link or create a Victoria project and configure preview-only staging variables. Add a synthetic Supabase Auth test user and verify list/correct/forget against staging before any production app connection.
