# Session: Durable Episode Turn Provenance

- Date: 2026-10-27
- Time: 15:04 EDT
- Status: Partial
- Scope: Connect the synchronous authenticated chat path to durable turn records and persist source turn references with episodic summaries.

## Outcome

The synchronous chat runtime now uses the existing `victoria_turns` repository lifecycle and passes owner/conversation-scoped turn references to the agent. Episode memory metadata stores matched source turn IDs separately from completed mocked-ledger outcome IDs.

## Work Completed

- Added chronological conversation listing to in-memory and PostgreSQL turn repositories.
- Updated synchronous chat handling to accept, start, complete, or fail durable turn records and provide the agent with exact user-message/turn-ID pairs.
- Updated explicit conversation finish to load completed turn references for the authenticated user and conversation.
- Persisted matched turn IDs in episode `sourceMetadata.sourceTurnReferences` and added handler and episodic-memory coverage.
- Updated the F9 deep-dive implementation note and [test plan](../test-plan.md).

## Decisions

- Reuse the existing turn lifecycle and table; no schema migration is needed.
- Keep turn evidence IDs distinct from authoritative ledger outcome IDs.
- Preserve topic-based correction/forget suppression while exact link-aware suppression remains follow-up work.

## Verification

- `npm run check`: passed; 81 test files passed, 9 skipped; 737 tests passed, 23 skipped, 9 todo.
- Existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted experimental SQLite warnings.

## Unresolved

- The separate queued-turn acceptance endpoint still has no agent worker.
- Exact episode turn links are persisted, but correction/forget suppression still relies on topic overlap and has not yet been converted to link-aware filtering.
- The synchronous handler creates a new idempotency key for each request; request retries are not deduplicated by this path.

## Recommended Next Step

Add tests and retrieval filtering that use persisted source turn references to suppress episodes when linked evidence is corrected or forgotten, including a PostgreSQL restart path.
