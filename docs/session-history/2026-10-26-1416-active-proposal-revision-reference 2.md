# Session: Active Proposal Revision References

- Date: 2026-10-26
- Time: 14:16 America/New_York
- Status: Completed
- Scope: Ground pending savings-proposal revisions in typed active workflow context and preserve approval safety.

## Outcome

Pending proposal edits now require a validated reference to the active action, proposal, and source event. Supported edits still create linked replacement proposals with new action IDs and require fresh approval.

## Work Completed

- Added typed active-proposal reference resolution alongside the active-event resolver in [conversation state manager](../../src/agent/conversation-state-manager.ts).
- Added proposal identity and revision-clarification context to the [context builder](../../src/agent/conversation-context-builder.ts) and passed it through the orchestrator to the specialists.
- Required exact active-state identity before accepting a classified proposal revision. An ungrounded revision remains pending and moves to a clarification state; a bare approval cannot bypass that clarification.
- Bound concise amount replies such as “Use $8” to an outstanding revision question. Unrelated messages containing amounts do not revise the active proposal.
- Updated [Story 6](../user-stories.md), the [MVP safety contract](../specification/mvp-safety-contract.md), the [test plan](../test-plan.md), the [agent work queue](../agent-work-queue.md), and [ADR 0001](../architecture/decisions/0001-orchestrated-multi-agent-architecture.md).

## Decisions

- Confirmed safety behavior: an active proposal pointer is context only, never approval or amount authority. A replacement proposal requires fresh exact-action approval.
- No new product capability or money-movement behavior was introduced.

## Verification

- Targeted agent tests passed: 131 tests across conversation state, context building, and VictoriaAgent.
- `npm run check` passed: 74 test files passed, 8 skipped; 679 tests passed, 19 skipped, 9 todo.
- `git diff --check` passed.
- Existing warnings: one unused-variable ESLint warning in `tests/unit/agent/memory-orchestrator.test.ts` and Node experimental SQLite warnings.

## Unresolved

- Changes remain local, uncommitted, and unpushed.
- The in-progress `awaitingValidRevision` flag is runtime-local. A restart preserves the pending proposal but may require the user to restate the revision explicitly; an unresolved revision still cannot mutate or approve it.
- General typed workflow state and references to older or non-active durable events remain open.

## Recommended Next Step

Design the smallest append-only persistence contract for revision-clarification state, then add restart tests before broadening the typed workflow-state manager.
