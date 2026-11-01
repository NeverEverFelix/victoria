# Session: Personalization provenance regression

- Date: 2026-10-27
- Time: 16:09 America/New_York
- Status: Partial
- Scope: Continue F8 with an agent-level regression for legacy memory provenance and complete the shared retrieval-quality gate.

## Outcome

An unprovenanced legacy memory can no longer shape a personalized reply, while an explicitly sourced preference still can. The shared memory gate also rejects invalid creation timestamps.

## Work Completed

- Added an agent-level personalization regression in [preference-memory.test.ts](../../tests/unit/agent/preference-memory.test.ts).
- Extended [isRetrievableMemory](../../src/agent/memory/retrieval-planner.ts) to require valid timestamps, in addition to provenance, confidence, active status, and bounded evidence fields.
- Updated [test-plan.md](../../tests/test-plan.md) and the F8 implementation notes in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- Preserve the explicit provenance and confidence thresholds while excluding malformed legacy records from response context.
- Keep category-specific memory-type eligibility in personalization separate from the shared quality gate.

## Verification

- Four focused memory/context/agent test files passed (226 tests).
- `npm run check` passed: 84 test files passed, 9 skipped; 758 tests passed, 24 skipped, 9 todo.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted experimental SQLite warnings.

## Unresolved

- F8's query rewriting, per-type budgets, and expanded episodic retrieval remain proposals without defined category quotas.
- The worktree contains other in-progress changes from earlier sessions; this entry covers only the retrieval gate and its regression.

## Recommended Next Step

- Define retrieval category budgets from actual response needs before implementing quotas; use real turn examples to ensure goals, dynamic finance facts, and episodic context are balanced without introducing irrelevant memories.
