# Session: Semantic Recall Fallback For Unindexed Memories

- Date: 2026-10-18
- Time: 13:01 America/New_York
- Status: Completed
- Scope: Close a retrieval gap where durable memories without embeddings could be omitted when vector search returned no rows.

## Outcome

Updated PostgreSQL semantic memory search to fall back to bounded, current user-scoped facts when vector search returns no indexed results. This preserves recall for durable facts whose embedding write previously failed, consistent with the existing fallback behavior for embedding-provider or search errors.

## Work Completed

- Added a regression test in [semantic-memory.test.ts](../../tests/unit/app/semantic-memory.test.ts) proving unindexed memories are returned through the current-memory query when vector search has no rows.
- Updated [postgres-memory-repository.ts](../../src/agent/memory/postgres-memory-repository.ts) to use bounded current-memory fallback on an empty vector result.
- Updated [test-plan.md](../../tests/test-plan.md) to cover the empty-indexed-results case.
- Vercel remains unauthenticated in the local CLI, so no preview deployment or authenticated live endpoint test was performed. Supabase production and staging schema work is recorded in the preceding session entries.

## Decisions

- Confirmed: when semantic search produces no results, Victoria uses the existing bounded recent-current-memory fallback. It does not alter or remove historical facts.

## Verification

- Added the regression test first and confirmed it failed before the implementation change.
- `npx vitest run tests/unit/app/semantic-memory.test.ts` passed: 9 tests.
- `npm run check` passed: 466 tests passed, 4 skipped, 9 todo. Lint has one existing unused-variable warning in `tests/unit/agent/memory-orchestrator.test.ts`; SQLite experimental warnings remain.
- `git diff --check` passed.

## Unresolved

- Vercel CLI login/project linking, staging environment configuration, Supabase Auth test-user setup, and live API endpoint verification remain outstanding.
- A durable background embedding retry/indexing process is not implemented; recent-memory fallback prevents total omission when vector search yields no rows but does not add missing vectors.

## Recommended Next Step

After Vercel authentication is available, configure a preview against the hosted staging project and test the memory endpoints with a synthetic staging Auth user. Then consider a durable retry/indexing workflow for missing memory embeddings.
