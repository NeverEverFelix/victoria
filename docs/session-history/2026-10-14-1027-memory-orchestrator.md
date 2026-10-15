# Session: Memory Orchestrator

- Date: 2026-10-14
- Time: 10:27 EDT
- Status: Completed
- Scope: Add a user-scoped memory orchestration service above SQLite short-term context, PostgreSQL semantic memory, and the transaction-derived financial profile.

## Outcome

Victoria now routes agent memory reads and learned-fact writes through `MemoryOrchestrator`. It filters stale and superseded profile facts, bounds semantic context to 12 memories by default, versions changes, and sends completed financial profile refreshes through the same service.

## Work Completed

- Added [`memory-orchestrator.ts`](../../src/agent/memory/memory-orchestrator.ts) as the lifecycle and retrieval policy boundary.
- Wrapped memory providers in the agent constructor, preserving existing SQLite/PostgreSQL adapters and mock default behavior.
- Updated persistent and Plaid runtime composition to share the orchestrator with Victoria and profile sync.
- Added append-only profile absence markers when a completed refresh no longer includes a previously current fact; absence markers supersede prior memories and are not embedded/retrieved as current profile claims.
- Added cache invalidation after profile refreshes and current-memory filtering at retrieval.
- Documented the lifecycle and added tests for versioning, stale profile filtering, profile writer routing, and disappearance reconciliation.
- Open-ended memory extraction, memory review/edit/delete controls, and live route/database enablement remain follow-up work.

## Decisions

- SQLite remains the short-lived conversation context/cache/outbox layer; PostgreSQL remains durable memory and semantic vector storage.
- Financial profile facts keep transaction-derived provenance and freshness; conversational memories preserve user statements/corrections separately.
- Semantic recall is bounded to 12 memories by default. It does not authorize savings or real money actions.
- Broad, model-generated memory extraction is not enabled; current explicit extraction behavior remains the learning input.

## Verification

- `npm run check` passed: agent setup validation, lint, type checks, 382 tests passed; 6 files and 4 tests skipped, 9 todo.
- `git diff --check` passed.
- No live provider, database, or Supabase calls were made; no credentials were added.

## Unresolved

- Persistent runtime and Plaid routes are still opt-in and not mounted in the application.
- Applying migrations and deciding user-visible memory review/deletion and broader memory extraction remain future work.
- The shared worktree contains uncommitted changes from earlier financial-profile sessions; preserve them.

## Recommended Next Step

Add a structured correction/forget flow that lets a user inspect and correct a specific remembered fact, writes a linked user-correction record, and verifies that the orchestrator retrieves the correction while retaining the original history.
