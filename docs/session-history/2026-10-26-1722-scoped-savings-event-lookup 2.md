# Session: Scoped savings event lookup

- Date: 2026-10-26
- Time: 17:22 America/New_York
- Status: Partial
- Scope: Add authoritative append-only savings event lookup scoped to one user and conversation and expose bounded event context to specialists.

## Outcome

Victoria now has in-memory and PostgreSQL event stores with exact user/conversation scoping. The orchestrator records recognized avoided-spend events, including those awaiting a missing amount, and retrieves the scoped event list before building specialist context. The Context Builder exposes a bounded read-only event projection. This provides authoritative identities but does not yet resolve historical natural-language references.

## Work Completed

- Added [event store contract](../../src/agent/savings-event-store.ts) and [PostgreSQL implementation](../../src/app/savings/postgres-conversation-savings-event-store.ts).
- Added migration `0024` in local and Supabase migration directories, including append-only protection, RLS, and a user/conversation lookup index.
- Wired read and record paths into Victoria and persistent/local mock runtime composition.
- Added bounded, provenance-labeled event context and clarified specialist instructions around its read-only authority.
- Updated the [agent work queue](../agent-work-queue.md), [safety contract](../specification/mvp-safety-contract.md), [user stories](../user-stories.md), and [test plan](../../tests/test-plan.md).

## Decisions

- Event identity reads are scoped by exact user and conversation.
- Event history is append-only. Specialists may use it as read-only context, never as approval or proof of a ledger entry.
- Historical phrase-to-event resolution remains a separate next step and must produce a unique, ambiguous, or no-match result before any historical target can be used.

## Verification

- Focused unit tests: 5 files passed, 142 tests passed.
- `npm run check`: passed; 77 files passed, 700 tests passed, 21 skipped, 9 todo. Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`.
- Applied migrations to isolated local database `victoria_integration_local` only.
- Persistent chat integration suite: 16 tests passed, including PostgreSQL event persistence and user/conversation isolation.

## Unresolved

- Implement deterministic natural-language reference resolution over the scoped event list; this change does not enable historical-event revisions.
- Working tree contains accumulated uncommitted changes from prior Victoria conversation-reliability sessions; no commit or push was requested.

## Recommended Next Step

Implement and test the resolver result contract (`unique`, `ambiguous`, `no_match`) using only the scoped event context. Keep proposal replacement and exact-action fresh approval in the existing deterministic lifecycle.
