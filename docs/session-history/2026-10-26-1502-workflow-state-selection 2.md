# Session: Select one typed workflow state for specialist context

- Date: 2026-10-26
- Time: 15:02 America/New_York
- Status: Completed
- Scope: Use the typed conversation workflow union to select one authoritative state for specialist context.

## Outcome

The orchestrator now selects one workflow state before building specialist context. A pending savings proposal awaiting confirmation takes precedence over a missing-amount clarification if inconsistent stores expose both. The Context Builder accepts this union as its preferred input while retaining focused compatibility inputs for existing direct tests.

## Work Completed

- Added `selectConversationWorkflowState` to [conversation-state-manager.ts](../../src/agent/conversation-state-manager.ts), with tests for clarification selection, confirmation selection, precedence, and empty state.
- Wired selection into [victoria-agent.ts](../../src/agent/victoria-agent.ts) and added the union input to [conversation-context-builder.ts](../../src/agent/conversation-context-builder.ts).
- Documented the selection rule and the current scope in [ADR 0001](../architecture/decisions/0001-orchestrated-multi-agent-architecture.md), [the agent work queue](../agent-work-queue.md), and [test-plan.md](../../tests/test-plan.md).

## Decisions

- Keep the context union limited to `awaiting_amount` and `awaiting_confirmation`, the states that reach specialist handoffs today.
- Goal-allocation and entry-correction confirmations remain handled by earlier deterministic gates and are not added to specialist context by this change.
- The selected state is context only; it does not alter persistence, approval, proposal lifecycle, or ledger authority.

## Verification

- `npm run check`: passed; 687 tests passed, 20 skipped, 9 todo. Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted the existing experimental SQLite warning.
- `RUN_POSTGRES_MEMORY_CHAT_INTEGRATION=true npx vitest run tests/integration/memory/postgres-persistent-chat.integration.test.ts` against `victoria_integration_local`: passed, 14/14 tests.
- `git diff --check`: passed.

## Unresolved

- Work remains local and uncommitted.
- Context Builder still exposes separate compatibility fields for the two workflow variants; remaining workflow types are not yet consolidated into one specialist-facing union.

## Recommended Next Step

- Migrate specialist context consumers and direct builder inputs to the single discriminated workflow union, then consider whether goal-allocation and entry-correction state needs specialist visibility at all.
