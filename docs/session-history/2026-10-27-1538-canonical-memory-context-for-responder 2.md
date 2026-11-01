# Session: Canonical Memory Context For Conversation Responder

- Date: 2026-10-27
- Time: 15:38 America/New_York
- Status: Completed
- Scope: Address the F2 finding that the read-only conversation responder received two independently selected memory views.

## Outcome

When the responder receives `financialContext`, its separate memory list now comes from that snapshot's provenance-filtered `selectedMemoryFacts`. This prevents the parallel raw-retrieval list from reintroducing system-inferred memories excluded by the canonical selector.

## Work Completed

- Added `ConversationResponderMemory` with provenance support in [`src/agent/conversation-responder.ts`](../../src/agent/conversation-responder.ts).
- Updated both conversational response paths in [`src/agent/victoria-agent.ts`](../../src/agent/victoria-agent.ts) to derive responder memories from the typed snapshot when present; legacy no-snapshot paths retain their existing behavior.
- Added a test that makes raw memory retrieval include a system inference and verifies the responder receives only the selected facts in the snapshot.
- Updated F2 and [`tests/test-plan.md`](../test-plan.md).

## Decisions

- The snapshot is authoritative for memory context on response paths that receive it. No confidence score is fabricated for selected facts; their user-statement/correction provenance is retained.
- The broader dedicated `ConversationContextSnapshot` interface and uniform construction across all branches remain open work.

## Verification

- `npm run check` — passed: agent setup validation, lint, app/test typechecks, and Vitest (84 files passed, 9 skipped; 750 tests passed, 24 skipped, 9 todo).
- Follow-up `npm run lint` and `git diff --check` — passed.
- One existing lint warning remains for `_observedThrough` in `tests/unit/agent/memory-orchestrator.test.ts`.
- Tests emit Node's experimental SQLite warning.

## Unresolved

- `financialContext` is still an optional type and is not built once through a single coordinator for every response branch.
- The combined worktree includes prior queued-turn and episode-provenance work and remains uncommitted.

## Recommended Next Step

Continue with a single acceptance case for response-depth handling or context construction, keeping the current snapshot's authority and financial approval boundary intact.
