# Session: Memory retrieval budget regression

- Date: 2026-10-27
- Time: 16:10 America/New_York
- Status: Partial
- Scope: Continue F8 by testing provenance behavior end-to-end and preventing always-relevant preferences from crowding topical facts out of personalization.

## Outcome

Personalization now excludes legacy memories without provenance and reserves at most two of six memory slots for always-relevant communication preferences.

## Work Completed

- Added an agent-level regression in [preference-memory.test.ts](../../tests/unit/agent/preference-memory.test.ts) proving an unprovenanced record is excluded while a valid `user_statement` preference is used.
- Added an optional `alwaysRelevantLimit` to [retrieval-planner.ts](../../src/agent/memory/retrieval-planner.ts), with a regression proving a topical goal retains a result slot when multiple always-relevant candidates exist.
- Personalized reply retrieval in [victoria-agent.ts](../../src/agent/victoria-agent.ts) caps always-relevant communication-style preferences at two.
- Updated [test-plan.md](../../tests/test-plan.md) and F8 notes in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- Keep the six-item overall personalization cap.
- Reserve no more than two items for communication preferences considered always relevant; rank remaining eligible memories by the existing relevance score.
- Broad category budgets remain undefined and were not introduced.

## Verification

- Planner and focused preference-memory tests passed.
- `npm run check` passed: 84 test files passed, 9 skipped; 759 tests passed, 24 skipped, 9 todo.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted experimental SQLite warnings.

## Unresolved

- F8's broader query rewriting, per-type budgets, and expanded episodic retrieval remain open proposals.
- The worktree contains other in-progress changes from earlier sessions; this entry covers only the F8 regression and preference slot cap.

## Recommended Next Step

- Gather a few representative multi-turn retrieval cases before setting additional category budgets; preserve relevance and memory-source boundaries for goals, financial profiles, and episodes.
