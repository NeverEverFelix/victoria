# Session: Add selected memory to specialist context

- Date: 2026-10-26
- Time: 13:31 America/New_York
- Status: Completed
- Scope: Extend the bounded conversation context builder to include selected, explicitly sourced durable memories for Financial Moment and Savings Reasoning.

## Outcome

The context builder now includes up to six already-retrieved user memories as separate, provenance-labeled historical context. It does not promote those memories to current-turn financial facts, approval, or workflow state.

## Work Completed

- Added bounded memory selection and provenance fields to [conversation-context-builder.ts](../../src/agent/conversation-context-builder.ts).
- Passed the query-retrieved memory set into the builder from [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added coverage for explicit user memories, inactive memories, and transaction-profile memories in [conversation-context-builder.test.ts](../../tests/unit/agent/conversation-context-builder.test.ts).
- Updated the architecture status in [agent-work-queue.md](../agent-work-queue.md) and [ADR 0001](../architecture/decisions/0001-orchestrated-multi-agent-architecture.md).

## Decisions

- Confirmed boundary: only retrieved memories with explicit `user_statement` or `user_correction` provenance and confidence of at least 0.85 enter the specialist context.
- Confirmed boundary: memory context remains historical evidence; it cannot itself supply a current savings amount or authorize an action.
- No new product behavior or persistence schema was approved.

## Verification

- `npm run check` passed: agent setup validation, lint, application and test type checks, and 668 tests passed (19 skipped, 9 todo).
- Existing warnings remain: one unused-variable lint warning in `tests/unit/agent/memory-orchestrator.test.ts` and Node's experimental SQLite warning.

## Unresolved

- The conversation context still has no durable event identity or general typed workflow-state manager.
- The separate local persistence opt-in discrepancy noted in the prior handoff remains unresolved.

## Recommended Next Step

Add one narrow typed state-manager behavior tied to a regression-tested revision of an active pending savings action; preserve the existing proposal identity and exact-approval boundary.
