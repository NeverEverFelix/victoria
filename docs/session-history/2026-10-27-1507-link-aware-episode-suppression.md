# Session: Link-Aware Episode Suppression

- Date: 2026-10-27
- Time: 15:07 EDT
- Status: Completed
- Scope: Carry stable source turn provenance through learned facts and lifecycle markers, then use exact links to suppress affected episodic memories.

## Outcome

Learned conversational memories now persist the current authenticated turn reference. Corrections and forget markers inherit source references from the memory they supersede. Episode retrieval compares these links and suppresses only episodes that share retired evidence turns when exact provenance is available; older records retain topic-based fallback behavior.

## Work Completed

- Added provenance to deterministic and provider-extracted memory learning paths in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Preserved source-turn references across append-only corrections and forget markers in [memory-orchestrator.ts](../../src/agent/memory/memory-orchestrator.ts).
- Added exact-link suppression with legacy fallback in [episodic-summary.ts](../../src/agent/memory/episodic-summary.ts).
- Added regression tests for linked versus unrelated same-topic episodes and provenance preservation through forget markers.
- Updated [the conversational deep dive](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md) and [test plan](../test-plan.md).

## Decisions

- Exact source-turn links take precedence when both an episode and lifecycle marker carry provenance. An unrelated linked episode is not suppressed merely because its prose shares a topic.
- Existing summaries and lifecycle records without turn references continue to use topic overlap for compatibility.

## Verification

- `npm run check`: passed; 81 test files passed, 9 skipped; 739 tests passed, 23 skipped, 9 todo.
- Existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted experimental SQLite warnings.

## Unresolved

- The separate queued-turn acceptance endpoint still lacks an agent worker.
- PostgreSQL integration coverage for episode provenance surviving a runtime restart was not added in this session; JSONB persistence is exercised by the existing repository path but a targeted integration case remains useful.

## Recommended Next Step

Add a PostgreSQL-backed restart test that learns a linked fact, writes an episode, forgets the fact, and confirms the episode remains suppressed after constructing a new runtime.
