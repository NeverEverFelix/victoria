# Session: Staging memory RLS role

- Date: 2026-10-18
- Time: 17:18 America/New_York
- Status: Partial
- Scope: Add a restricted Postgres role for authenticated memory management and verify it against hosted staging.

## Outcome

Memory-management database statements now run under a transaction-local verified-user scope, and the matching restricted role is installed and verified in staging. Live application deployment remains blocked on Vercel authentication and staging endpoint credentials/test identity.

## Work Completed

- Added [0009_memory_api_rls_role.sql](../../db/migrations/0009_memory_api_rls_role.sql) and a Supabase migration symlink. The role is non-login, non-superuser, non-role-creating, and does not bypass RLS. It receives SELECT/INSERT only on conversational memories and embeddings.
- Added [rls-scoped-memory-management.ts](../../src/app/http/rls-scoped-memory-management.ts). Every repository statement gets its own transaction, `SET LOCAL ROLE`, and verified subject claim, then commits or rolls back before releasing the connection.
- Routed authenticated management handlers through a user-scoped memory provider in [memory-management-handler.ts](../../src/app/http/memory-management-handler.ts) and [create-persistent-memory-management-runtime.ts](../../src/app/http/create-persistent-memory-management-runtime.ts).
- Applied migration 0009 to the linked staging Supabase project. Verified role attributes and table privileges: SELECT/INSERT true, UPDATE/DELETE false; verified the role can set a subject and query under RLS.
- Updated [environments.md](../environments.md) and [agent-work-queue.md](../agent-work-queue.md).

## Decisions

- Confirmed implementation choice: direct Postgres memory requests explicitly enter a restricted non-login role and set the authenticated subject locally per transaction. Supabase's `postgres` connection itself can bypass RLS, so relying only on table policies would not provide database-level user isolation.
- Production remains on migrations 0001–0008 until the new staging runtime is validated; apply 0009 before production deployment.

## Verification

- `npm run check` passed: 469 tests passed, 4 skipped, 9 todo. Existing ESLint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:83`.
- Targeted RLS scoped handler tests passed: 8 tests across the scoped runtime and management handlers.
- `npx supabase db push --yes` applied migration 0009 to staging; `npx supabase migration list` confirmed it is recorded.
- Staging catalog query confirmed role is `NOLOGIN`, `NOSUPERUSER`, `NOCREATEROLE`, `NOBYPASSRLS`, with SELECT/INSERT but no UPDATE/DELETE on conversational memory. A transaction using `SET LOCAL ROLE victoria_memory_api` and a synthetic subject queried successfully under RLS.
- First attempt to set privileged role attributes explicitly failed because Supabase does not allow the project Postgres login to ALTER those attributes. The migration was adjusted to rely on PostgreSQL's safe defaults; the retry succeeded.

## Unresolved

- Production has not received migration 0009.
- Vercel is not authenticated or linked; no deployment has been created.
- No staging Auth test user, staging application environment secrets, or authenticated endpoint-level inspect/correct/forget smoke test is configured.
- Persistent chat durability and approval state remain separate deployment gaps.

## Recommended Next Step

Establish non-UI Vercel CLI authentication and project linkage plus a staging-only Auth test identity, then configure preview environment secrets and exercise inspect/correct/forget against staging before touching production.
