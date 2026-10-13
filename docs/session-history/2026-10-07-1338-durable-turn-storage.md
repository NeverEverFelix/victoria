# Session: Add PostgreSQL-backed durable turn storage

- Date: 2026-10-07
- Time: 13:38 America/New_York
- Status: First durable turn-storage slice implemented and checked; live database verification pending
- Scope: Implement PostgreSQL persistence for accepted turn lifecycle records behind the existing repository contract.

## Outcome

Added a PostgreSQL-backed `TurnRepository`, schema migration, pool factory, and migration command. Database uniqueness now provides cross-process idempotency for turn admission, and row-locked revision checks protect lifecycle transitions. The implementation is not connected to a production route or a configured database.

## Work Completed

- Added [PostgresTurnRepository](../../src/app/turns/postgres-turn-repository.ts) with transaction-backed admission, user/conversation-scoped reads, and atomic compare-and-transition.
- Added the initial schema in [0001_victoria_turns.sql](../../db/migrations/0001_victoria_turns.sql), including user-scoped idempotency uniqueness and lifecycle shape constraints.
- Added a shared pg pool factory and an advisory-lock migration runner exposed as `npm run db:migrate`.
- Added adapter tests and updated the [test plan](../test-plan.md), [readiness checklist](../architecture/multi-agent-readiness.md), and [work queue](../agent-work-queue.md).
- Preserved unrelated pre-existing worktree changes in the provider comparison and response policy files.

## Decisions

- Use PostgreSQL for the first durable adapter, consistent with the proposed architecture direction, while keeping the pool injectable.
- Keep this slice limited to turn lifecycle persistence. Pending proposals, approvals, ledger records, conversation leases, route wiring, and production authentication remain separate work.
- `ADR 0002` remains proposed; this implementation does not accept its hosting or capacity choices.

## Verification

- `npm run check` — passed: agentic validation, lint, both TypeScript checks, 282 tests passed; five files skipped, four tests skipped, one todo.
- `git diff --check` — passed.
- No PostgreSQL instance was configured, so migrations and concurrency behavior were not exercised against a live database.

## Unresolved

- Configure a database and run `npm run db:migrate` against it; add live PostgreSQL tests for concurrent accept/replay, row-lock transitions, and process restart recovery.
- Wire the repository to the authenticated HTTP boundary after a production identity and conversation ownership provider are selected.
- Persist pending proposal, approval, and immutable ledger history before moving the conversational agent to a stateless runtime.
- Add cross-process conversation ordering/lease semantics.

## Recommended Next Step

Set up a local or hosted PostgreSQL database, apply the migration, and add an opt-in integration test suite against it before wiring durable turn admission into a server route.
