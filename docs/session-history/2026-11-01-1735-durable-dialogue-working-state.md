# Session: Durable Dialogue Working State

- Date: 2026-11-01
- Time: 17:35 America/New_York
- Status: Partial
- Scope: Address the F-04 conversation-continuity finding with a bounded, source-linked working-state store separate from the rolling transcript and long-term personal memory.

## Outcome

Victoria now retains up to 40 user-authored turns per user/conversation for 30 days and can provide up to six relevant historical excerpts to a read-only responder after the 20-message transcript window has rolled forward. The excerpts remain historical discussion, not verified financial evidence or action authority. Sensitive health, identity, political, religious, sexuality, race, ethnicity, immigration, credential, contact, and account details are excluded.

## Work Completed

- Added state validation, idempotent turn append, expiry refresh, sensitive-content exclusion, and relevance selection in [`src/agent/dialogue-working-state.ts`](../../src/agent/dialogue-working-state.ts).
- Added scoped PostgreSQL persistence through [`src/agent/memory/postgres-memory-repository.ts`](../../src/agent/memory/postgres-memory-repository.ts), with `MemoryOrchestrator` validation/forwarding and mock/SQLite-adapter support.
- Added matching local and Supabase schema migrations: [`db/migrations/0030_dialogue_working_state.sql`](../../db/migrations/0030_dialogue_working_state.sql) and [`supabase/migrations/0030_dialogue_working_state.sql`](../../supabase/migrations/0030_dialogue_working_state.sql). The table is server-only, scoped by user and conversation, indexed for expiry cleanup, and bounded to 40 turns.
- Integrated prior excerpts into read-only context snapshots and instructed the responder to treat them as historical, non-authoritative dialogue in [`src/agent/conversation-responder.ts`](../../src/agent/conversation-responder.ts).
- Added continuity, expiry, scope, privacy, numeric-grounding, persistence, migration, and post-transcript-window tests.
- Updated [`docs/mvp.md`](../mvp.md), [`docs/user-stories.md`](../user-stories.md), [`tests/test-plan.md`](../../tests/test-plan.md), and the F-04 status in [`docs/architecture/conversation-architecture-review-2026-11-01-follow-up.md`](../architecture/conversation-architecture-review-2026-11-01-follow-up.md).

## Decisions

- The initial working state stores exact user-authored excerpts, not model-generated summaries. It does not cross conversation boundaries or replace structured financial event/workflow stores.
- Prior dialogue excerpts do not support new dollar claims. Numeric response validation continues to require current-turn or typed financial evidence.
- F-04 is partial: typed unresolved-question and confirmed-constraint lifecycles, explicit correction links, and richer topic selection remain future work.
- F-05 remains open; this change does not add cross-session financial-history retrieval.

## Verification

- Focused dialogue, context, agent, PostgreSQL adapter, and migration tests: 274 tests passed.
- `npm run check`: passed agent validation, lint, source and test type checks, and full suite (127 files passed, 9 skipped; 1,123 tests passed, 29 skipped, 9 todo).
- `git diff --check HEAD`: passed.
- Local and Supabase migration copies compare equal.
- Existing Node SQLite experimental warnings remain.

## Unresolved

- F-01 remains partial; whole-turn outcome collection and universal response composition remain spread across services.
- F-03 and F-06 still need broader held-out and human evaluation.
- F-05 cross-session financial-history retrieval remains open.
- F-07 needs blinded human quality review before making the specialist-routing decision.
- F-08 remains deferred by the mock-ledger MVP boundary.
- F-10 requires the repository owner to replace the invalid Actions API secret and rerun the AI review job.
- This worktree contains other pre-existing changes and tracked snapshot deletions; preserve them.

## Recommended Next Step

Evaluate a separate typed dialogue-state projection for unresolved questions and user-corrected constraints, retaining immutable source-turn links. Keep cross-session financial event recall separate and do not treat either channel as approval or current account evidence.
