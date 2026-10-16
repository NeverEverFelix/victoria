# Session: Memory persistence verification and retention

- Date: 2026-10-15
- Time: 22:17 EDT
- Status: Completed
- Scope: Apply and verify PostgreSQL migrations, pgvector and memory permissions, plus retention and deletion of memory facts and embeddings.

## Outcome

The full migration set applies through the guarded migration runner to a fresh isolated PostgreSQL 17 database and reruns idempotently. pgvector, RLS, semantic retrieval permissions, explicit deletion, and scheduled memory expiry were verified with synthetic Supabase roles and identities. No remote Supabase project was configured or modified.

## Work Completed

- Applied all 13 migration files (versions 0001–0007 and 0009–0014) twice through `npm run db:migrate` on an ephemeral loopback PostgreSQL 17 test database.
- Verified pgvector 0.8.7 and the HNSW vector index.
- Live SQL checks confirmed authenticated RLS isolation and vector-search scoping, `anon` cannot access memory tables or execute vector retrieval, and only authenticated/server roles receive the required vector-schema usage.
- The permission check exposed a real grant gap: PostgreSQL's default `PUBLIC` execute grant made semantic retrieval callable by `anon`. Added migration `0014_semantic_search_permissions.sql` and tightened the fresh-install grant in migration 0004.
- Added migration `0013_memory_retention.sql`. User-stated facts persist until explicit Forget/Forget all; episodic summaries and current transaction-profile facts expire after 90 days; stale profile corrections expire with their source; embeddings are deleted in the same transaction.
- Verified Forget selected removes linked facts and embeddings, Forget all removes conversational facts/embeddings while preserving profile facts, and the expiry function removes stale facts/embeddings while retaining fresh and user-stated memories.
- Updated [memory schema](../specification/user-learning-schema.md), [decisions](../decisions.md), [MVP](../mvp.md), [test plan](../../tests/test-plan.md), and the [agent work queue](../agent-work-queue.md).

## Decisions

- User-stated preferences, habits, goals, and corrections have no automatic expiry; users control their lifecycle through Forget and Forget all.
- Episodic summaries and current transaction-profile observations expire after 90 days. Profile disconnect/delete-all remains an immediate purge.
- Embeddings follow the source fact's retention and deletion policy.

## Verification

- `npm run db:migrate` passed twice against a clean temporary PostgreSQL 17 database; the migration ledger reported 13 applied migrations.
- Isolated SQL checks passed for pgvector version/index, authenticated and anonymous grants, user RLS/vector-search isolation, Forget, Forget all, and retention cleanup.
- `git diff --check` passed.
- `npm run check` passed: 56 test files passed, 6 skipped; 471 tests passed, 4 skipped, 9 todo.
- Existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts:95`; Node reports the existing experimental SQLite warning.

## Unresolved

- The remote Supabase project is not configured in this workspace, so migrations were not applied there. Repeat the migration and permission checks against the target Supabase project before enabling the persistent runtime.
- Production scheduling, monitoring, and alerting for `victoria_expire_plaid_data` remain deployment tasks.

## Recommended Next Step

- Configure a non-production Supabase project and repeat the migration, RLS, retrieval, deletion, and retention checks using its actual authenticated and service roles before live activation.
