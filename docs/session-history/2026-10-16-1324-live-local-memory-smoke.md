# Session: Live local memory and profile smoke check

- Date: 2026-10-16
- Time: 13:24 America/New_York
- Status: Completed
- Scope: Exercise persistent semantic memory and transaction-derived profile storage against the local pgvector database with synthetic data.

## Outcome

The live local adapter path successfully persisted and recalled a user memory, isolated retrieval by user, and persisted/recalled a synthetic transaction profile. The smoke check found and fixed a null metadata write that Postgres rejects.

## Work Completed

- Fixed [postgres-memory-repository.ts](../../src/agent/memory/postgres-memory-repository.ts) to serialize absent source metadata as `{}` instead of explicitly inserting SQL `NULL` into a non-null column.
- Added a focused regression assertion in [semantic-memory.test.ts](../../tests/unit/app/semantic-memory.test.ts).
- Ran a one-off live adapter smoke check through the local pgvector database. A deterministic local hash embedder wrote 1536-dimensional vectors, semantic lookup recalled the emergency-fund fact, and another synthetic user received no results.
- Built a profile from three synthetic Blue Bottle purchases ($6.50, $7.00, $7.50), persisted its derived merchant/category memories and embeddings, and retrieved them semantically. The profile median was $7.00.
- Removed the synthetic conversational record with the memory control and the separately managed synthetic profile records with `victoria_purge_plaid_profile_memories`; verified zero smoke-check memory and embedding rows remain.

## Decisions

- Synthetic transaction rows were used; no Plaid service or live user data was involved.
- The deterministic embedder verifies database vector writes and retrieval mechanics, not embedding quality from the production OpenAI embedding model.
- Forget-all correctly left separately managed profile memories intact; the profile purge lifecycle was used for cleanup.

## Verification

- `npm test -- tests/unit/app/semantic-memory.test.ts` passed (7 tests).
- Live pgvector smoke check passed for semantic write/retrieval, cross-user filtering, transaction-profile persistence/retrieval, median spend, and cleanup.
- Confirmed no recent `local_live_smoke_*` memory rows remain and `git diff --check` passed.
- Full test suite and real OpenAI embedding calls were not run.

## Unresolved

- Production embedding quality, provider credentials, and persistent chat runtime wiring remain unverified.
- The local database is still separate from the default mock chat runtime.
- The worktree contained unrelated uncommitted work before this session; it remains untouched.

## Recommended Next Step

- Exercise the persistent runtime end-to-end with a local authenticated test boundary and the real embedding provider when a key is intentionally configured, while keeping synthetic transaction fixtures and all Plaid calls disabled.
