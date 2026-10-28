# Session: Memory retrieval category/key identity

- Date: 2026-10-27
- Time: 15:59 America/New_York
- Status: Partial
- Scope: Continue F8 by preventing retrieval ranking from conflating facts from separate memory categories.

## Outcome

Memory retrieval now deduplicates version history using both category and key, so unrelated facts with a shared key remain eligible together.

## Work Completed

- Updated [retrieval-planner.ts](../../src/agent/memory/retrieval-planner.ts) to identify versions by `(category, key)` before ranking and limiting results.
- Added a regression case in [retrieval-planner.test.ts](../../tests/unit/agent/memory/retrieval-planner.test.ts).
- Updated expected behavior in [test-plan.md](../../tests/test-plan.md) and the F8 note in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- Keep provenance eligibility and confidence thresholds unchanged; this change fixes identity collisions only.
- Query rewriting, per-type budgets, and expanded episodic retrieval remain open F8 proposals.

## Verification

- Retrieval-planner tests passed.
- `npm run check` passed: 84 test files passed, 9 skipped; 756 tests passed, 24 skipped, 9 todo.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted experimental SQLite warnings.

## Unresolved

- F8 still has separate eligibility filters around different retrieval consumers, and the broader planner proposal is not implemented.
- The worktree contains other in-progress changes from earlier sessions; this entry covers only this F8 slice.

## Recommended Next Step

- Compare provider-search and deterministic-recall eligibility for stale, forgotten, and low-provenance memory records before broadening which memory types can reach a response.
