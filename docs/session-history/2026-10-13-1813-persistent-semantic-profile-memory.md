# Session: Add Persistent Semantic Memory For Personalization

- Date: 2026-10-13
- Time: 18:13 America/New_York
- Status: Schema and retrieval path implemented; Supabase/provider verification pending
- Scope: Persist user learning and transactions-only financial-profile facts with pgvector semantic retrieval.

## Outcome

Added a Supabase-oriented PostgreSQL schema and repository path for append-only user memories, including transaction-derived financial-pattern facts. The agent now asks the memory provider for context relevant to the current user message; PostgreSQL uses model-versioned vectors and user-scoped similarity search when an embedding provider is injected.

## Work Completed

- Added migration [`0004_semantic_user_memory.sql`](../../db/migrations/0004_semantic_user_memory.sql) with provenance fields, financial-pattern category, 1536-dimensional embeddings, HNSW cosine index, semantic search function, and owner RLS policies for memory/context/decision records.
- Added [`SemanticEmbeddingProvider`](../../src/agent/memory/semantic-embedding.ts) validation and PostgreSQL vector serialization.
- Extended [`PostgresMemoryRepository`](../../src/agent/memory/postgres-memory-repository.ts) to append embeddings, semantically search per user/model, fall back to recent memory if embedding search fails, and map profile aggregates through `rememberFinancialProfile`.
- Passed the current user message to memory retrieval from the agent; the SQLite cache bypasses user-only cached memory for query-specific retrieval.
- Added [`user-learning-schema.md`](../specification/user-learning-schema.md) and updated the user story, MVP, safety contract, decisions, queue, and test plan.
- Added semantic-memory tests for vector storage, retrieval filters, and profile source metadata.

## Decisions

- Confirmed scope remains the transactions-only profile. Merchant/category profile aggregates share the persistent memory and semantic retrieval path with explicit preferences, habits, and goals.
- The initial vector width is 1536. One embedding model must be used consistently for a given stored/query vector pair; model versions are stored with each vector.
- Supabase RLS and repository user filters both scope retrieval. Superseded facts and transaction-profile facts older than 90 days are excluded from semantic search and its non-vector fallback.
- Embedding generation is an injected adapter; no external embedding provider is enabled in the default mock composition.

## Verification

- Targeted semantic, memory, and SQLite-cache tests passed: 36 tests before final changes.
- `npm run check` — passed: agent validation, lint, source/test type checks; 38 test files passed, 6 skipped; 369 tests passed, 4 skipped, 9 todo.
- `git diff --check` — passed.
- Existing Node experimental SQLite warnings remain.
- Migration `0004` was not applied to a live database; Supabase/pgvector is not configured yet.

## Unresolved

- Implement and configure a concrete 1536-dimensional embedding provider.
- Apply and verify migration `0004` in the user's Supabase project, including RLS, function grants, HNSW index, and query plan.
- Define data deletion/retention handling for facts and embeddings.
- Wire live Plaid Transactions sync and call `rememberFinancialProfile` from the profile refresh flow; token vault and sync lifecycle remain open.
- The worktree contained earlier unrelated agent, memory, profile, and documentation changes; they were preserved.

## Recommended Next Step

Set up Supabase and pgvector, apply migrations `0001`–`0004`, and run a database integration test for owner isolation, append-only writes, stale-profile filtering, and semantic ranking before wiring the embedding and Plaid providers into the default server composition.
