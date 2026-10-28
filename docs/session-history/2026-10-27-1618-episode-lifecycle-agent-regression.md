# Session: Episode lifecycle agent regression

- Date: 2026-10-27
- Time: 16:18 America/New_York
- Status: Partial
- Scope: Verify durable episode provenance and correction suppression end to end in the agent flow.

## Outcome

An episode created at conversation finish retains its matched durable source turn ID. Correcting the linked user fact prevents that episode from shaping a later related reply.

## Work Completed

- Added an agent-level test in [episodic-memory.test.ts](../../tests/unit/agent/episodic-memory.test.ts) that saves a provenance-linked fact, finishes the conversation with the durable user turn reference, verifies episode provenance, corrects the fact, and checks later recall.
- Updated [test-plan.md](../../tests/test-plan.md) and F9 implementation notes in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- Keep episodic summaries separate from ordinary user-fact retrieval and preserve exact turn links for lifecycle suppression.
- Retain existing independent PostgreSQL restart integration coverage; this new test uses the mock-backed agent flow.

## Verification

- Focused lifecycle regression passed.
- `npm run check` passed: 84 test files passed, 9 skipped; 760 tests passed, 24 skipped, 9 todo.
- The only lint warning remains `_observedThrough` in `tests/unit/agent/memory-orchestrator.test.ts`; Node emitted experimental SQLite warnings.

## Unresolved

- The broader F8 query rewrite and additional retrieval budgets remain open.
- The worktree contains other in-progress changes from earlier sessions; this entry describes only the episode lifecycle regression.

## Recommended Next Step

- If an end-to-end production-path guarantee is needed, extend the PostgreSQL integration case to create and correct a durable-turn episode across a repository restart.
