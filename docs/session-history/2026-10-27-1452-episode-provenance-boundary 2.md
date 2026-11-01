# Session: Episode Provenance Integration Boundary

- Date: 2026-10-27
- Time: 14:52 EDT
- Status: Partial
- Scope: Continue the conversational-core deep-dive by tracing the recommended durable episode provenance work against current turn and transcript contracts.

## Outcome

Verified the current conversational-core worktree and documented why exact episode-to-turn links cannot safely be added inside the existing `VictoriaAgent.respond()` path: it receives transcript strings, while durable `TurnRecord.id` values are owned by a separate queued-turn boundary.

## Work Completed

- Read [the conversational-core deep dive](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md), the current product/safety instructions, and the latest related session history.
- Traced episode summarization in [victoria-agent.ts](../../src/agent/victoria-agent.ts), the memory persistence contract, and the queued turn repository. Confirmed the current episode digest is a content key, not a stable turn ID.
- Added an implementation-boundary note to F9 of the deep dive. It records the required future seam: pass explicit user-scoped turn references into the agent and persist append-only evidence links; keep financial outcome IDs distinct from user-message evidence references.
- Preserved all existing working-tree changes.

## Decisions

- Confirmed implementation constraint: do not represent transcript hashes or positions as durable turn IDs.
- Existing topic-based suppression remains the fallback until stable turn references can be supplied and persisted. No product behavior or financial authority changed.

## Verification

- `npm run check`: passed; agent setup validation, lint, type checks, and tests passed. 81 test files passed, 9 skipped; 736 tests passed, 23 skipped, 9 todo.
- `git diff --check`: passed.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted experimental SQLite warnings.

## Unresolved

- Episode evidence still lacks durable links to original user turn IDs and immutable event IDs across process restarts.
- Current `TurnRecord` IDs are not propagated through the conversational agent call path.
- The working tree contains extensive pre-existing modified and untracked implementation files; none were reset or overwritten.

## Recommended Next Step

Define an explicit turn-reference contract between the queued-turn handler/runtime and `VictoriaAgent.respond()`, then add user-scoped append-only episode evidence-link persistence and correction/forget tests across restart and retrieval paths.
