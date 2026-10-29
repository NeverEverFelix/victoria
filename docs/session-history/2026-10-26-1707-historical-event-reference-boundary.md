# Session: Historical event reference boundary

- Date: 2026-10-26
- Time: 17:07 America/New_York
- Status: Partial
- Scope: Audit the next proposed conversation-reference slice and identify the authoritative identity boundary required before resolving older savings events.

## Outcome

The repository does not currently expose a read-only savings-event lookup scoped by user and conversation. `TurnContext.recurringCosts` is derived from recent transcript text and turn indexes; it is not a durable `SavingsEvent` source. The work queue now states this prerequisite and prohibits treating transcript matches or selected memories as historical event identities.

## Work Completed

- Inspected [TurnContext](../../src/agent/turn-context.ts), the [VictoriaTools contract](../../src/agent/tools/contracts.ts), the Context Builder, and the active-event resolver.
- Updated [the agent work queue](../agent-work-queue.md) to narrow the next slice to a read-only, ownership-scoped event lookup seam or a clear unsupported-reference response before adding historical-event resolution.
- Ran `git diff --check`: passed.

## Decisions

- Transcript-derived recurring-cost facts and retrieved memories remain contextual evidence; neither supplies authoritative event identity for revising a prior savings proposal.
- Any future historical-event resolver must bind the event to both the authenticated user and conversation. Proposal revisions and ledger writes remain governed by the existing pending-action identity and fresh-approval lifecycle.
- This is an architecture constraint based on current code, not a decision to add an event-history feature to the MVP.

## Verification

- Read-only source audit confirmed `VictoriaTools` has no prior-event lookup method and `TurnContext` stores transcript-derived recurring costs only.
- `git diff --check`: passed.
- No runtime behavior changed; tests were not run.

## Unresolved

- Older and non-active event references remain unsupported as explicit typed targets.
- The repository does not yet define whether historical-event reference lookup belongs in the existing tools boundary, a new query interface, or a conservative unsupported response.
- Work remains local and uncommitted.

## Recommended Next Step

- Choose the smallest compatible source contract: either add a read-only query that returns events scoped to the authenticated user and conversation, with mock/PostgreSQL implementations, or keep historical targeting unsupported and ask users to restate the event in the current conversation. Do not add a resolver until the source can prove ownership and identity.
