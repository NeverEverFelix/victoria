# Session: Expand conversation context and add durable preference memories

- Date: 2026-10-13
- Time: 12:18 America/New_York
- Status: Implemented and checked; live PostgreSQL verification pending
- Scope: Treat short-term memory as ongoing conversation context and model durable preference facts separately.

## Outcome

Replaced the arbitrary four-message cap with a configurable 20-message rolling context containing user and Victoria turns. Context is retained through clear intents, written locally to SQLite, and backed up asynchronously to PostgreSQL through the outbox. Added durable evidence-backed conversational memory facts, including preference records such as “prefers saving $20 rather than $50,” with user scoping, confidence, and supersession links.

## Work Completed

- Updated [VictoriaAgent](../../src/agent/victoria-agent.ts) to retain and provide rolling conversation context to later classifications.
- Updated mock classification to use only directly relevant prior user context for short, contextual replies, so unrelated prior turns do not distort new clear messages.
- Added user-scoped append-only fact records to [PostgresMemoryRepository](../../src/agent/memory/postgres-memory-repository.ts) and SQLite read caching in [SqliteCachedMemoryProvider](../../src/agent/memory/sqlite-cached-memory-provider.ts).
- Extended migration 0003 with the 20-message constraint and durable fact table.
- Added tests for the rolling context, assistant/user context, preference fact storage, user isolation, and retry behavior.
- Documented that automatic preference extraction is still open in [the work queue](../agent-work-queue.md).

## Decisions

- Confirmed: current conversation context defaults to the most recent 20 user and Victoria messages; the provider limit is configurable.
- Confirmed: durable preferences are facts with evidence and confidence; corrections/supersession append a linked fact.
- Confirmed: “prefers saving $20 rather than $50” is a product example for the stored preference shape, not an extracted real user preference.
- Automatic extraction and production provider wiring remain proposals/work items, not completed behavior.

## Verification

- `npm run check` — passed: 31 test files passed (6 skipped), 323 tests passed (4 skipped, 9 todo).
- `git diff --check` — passed.
- SQLite emitted Node's experimental-feature warning. No PostgreSQL instance was available for migration or integration verification.

## Unresolved

- Automatic extraction, confirmation/correction behavior, and lifecycle for learned preference facts remain unimplemented.
- Production SQLite path/lifecycle and live PostgreSQL verification remain open.
- Habits and goals are not durably stored by this memory provider.

## Recommended Next Step

Add a bounded preference-extraction contract that proposes evidence-backed facts for deterministic validation, then decide which fact types Victoria may remember without an explicit user confirmation.
