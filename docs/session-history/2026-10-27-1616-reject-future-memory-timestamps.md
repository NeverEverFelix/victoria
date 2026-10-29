# Session: Reject future memory timestamps

- Date: 2026-10-27
- Time: 16:16 America/New_York
- Status: Partial
- Scope: Continue the F8 retrieval gate by rejecting future-dated records before recency scoring.

## Outcome

The shared retrieval eligibility check now excludes memory records whose creation timestamp is in the future, preventing malformed records from receiving maximum recency weight.

## Work Completed

- Added a future-date case to [retrieval-planner.test.ts](../../tests/unit/agent/memory/retrieval-planner.test.ts).
- Updated [retrieval-planner.ts](../../src/agent/memory/retrieval-planner.ts) so retrievable memories must have a parseable, non-future creation timestamp.
- Updated [test-plan.md](../../tests/test-plan.md) and the F8 note in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).
- Confirmed existing episodic recall has a separate 90-day freshness and relevance gate plus lifecycle suppression; did not broaden system-inference retrieval.

## Decisions

- Keep episodic summaries on their separate validated retrieval path rather than passing them through the user-statement memory gate.
- Reject future creation timestamps at the shared ordinary-memory retrieval boundary.

## Verification

- `npm run check` passed: 84 test files passed, 9 skipped; 759 tests passed, 24 skipped, 9 todo.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted experimental SQLite warnings.

## Unresolved

- F8's broader query rewriting and category budgets beyond the two-slot always-relevant preference cap remain open.
- The worktree contains other in-progress changes from earlier sessions; this entry covers only the timestamp gate.

## Recommended Next Step

- Add an agent-level episodic recall test for an episode created by a durable turn, including the exact source-turn link and lifecycle suppression after a correction.
