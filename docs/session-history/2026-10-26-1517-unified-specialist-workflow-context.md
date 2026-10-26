# Session: Unified specialist workflow context

- Date: 2026-10-26
- Time: 15:17 America/New_York
- Status: Completed
- Scope: Replace parallel pending-workflow fields in specialist context with one discriminated workflow state.

## Outcome

Financial Moment and Savings Reasoning now receive a single `workflowState` field. It is either `awaiting_amount` or `awaiting_confirmation`, with the proposal identity and message-specific references available only on the confirmation branch. The Context Builder accepts only the discriminated union as workflow input.

## Work Completed

- Removed `activeSavingsWorkflow` and `pendingAmountClarification` as separate specialist-context properties and removed the Context Builder's parallel workflow input adapters from [conversation-context-builder.ts](../../src/agent/conversation-context-builder.ts).
- Updated deterministic orchestration access in [victoria-agent.ts](../../src/agent/victoria-agent.ts), plus both specialist prompts and their handoff tests.
- Updated direct context tests to use valid typed workflow variants and documented the one-field contract in [test-plan.md](../../tests/test-plan.md), [the agent work queue](../agent-work-queue.md), and [ADR 0001](../architecture/decisions/0001-orchestrated-multi-agent-architecture.md).

## Decisions

- Keep goal-allocation and entry-correction approvals outside this context union because deterministic early gates handle them before specialist handoff.
- Keep the amount-clarification branch free of proposal identity, approval, or an inferred amount.

## Verification

- `npm run check`: passed; 687 tests passed, 20 skipped, 9 todo. Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted the existing experimental SQLite warning.
- `RUN_POSTGRES_MEMORY_CHAT_INTEGRATION=true npx vitest run tests/integration/memory/postgres-persistent-chat.integration.test.ts` against `victoria_integration_local`: passed, 14/14 tests.
- `git diff --check`: passed.

## Unresolved

- Work remains local and uncommitted.
- The union covers only the two workflows that reach specialist context. Goal allocation, entry correction, and broader durable conversation facts still have their own state paths.

## Recommended Next Step

- Review whether read-only specialist visibility is needed for goal-allocation or entry-correction confirmation; preserve their current deterministic early gates unless a user-visible need justifies a narrowly scoped context addition.
