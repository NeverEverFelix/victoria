# Session: Make short-term memory SQLite-first

- Date: 2026-10-13
- Time: 12:06 America/New_York
- Status: Implemented and checked
- Scope: Clarify and enforce the separate write semantics for SQLite short-term conversation context and PostgreSQL durable conversational memory.

## Outcome

Corrected the prior implementation's framing and write order. Short-term clarification context is now written to SQLite first and remains available during PostgreSQL outages. A SQLite outbox retries its PostgreSQL backup. Durable conversational decisions still use PostgreSQL as their source of truth, with SQLite read caching.

## Work Completed

- Added 30-minute expiry for current clarification context in SQLite and PostgreSQL backup storage.
- Added a retryable SQLite outbox and made context reads use local short-term state first.
- Preserved user/conversation scoping and the four-message bound.
- Added coverage for PostgreSQL outage/retry and expiry.
- Updated the memory decision, MVP description, work queue, and test plan to distinguish the two storage lifecycles.

## Decisions

- Confirmed: SQLite is the first write target for short-term context; PostgreSQL backup can retry after the turn continues.
- Confirmed: durable remembered decisions remain PostgreSQL-first, with SQLite as their cache.
- This entry clarifies the memory decision recorded in [`the earlier session entry`](2026-10-13-1156-sqlite-postgres-conversational-memory.md).

## Verification

- `npm run check` — passed: 31 test files passed (6 skipped), 320 tests passed (4 skipped, 9 todo).
- `git diff --check` — passed.
- No live PostgreSQL instance was configured.
- Node emitted its experimental-feature warning for built-in `node:sqlite`.

## Unresolved

- Production still needs a selected SQLite file path/runtime lifecycle and live PostgreSQL verification.
- Habit and goal persistence and broader retention/deletion behavior remain open.

## Recommended Next Step

Choose the target runtime and configure a persistent SQLite path before wiring this provider into production composition; then verify outage recovery and context expiration against a real PostgreSQL database.
