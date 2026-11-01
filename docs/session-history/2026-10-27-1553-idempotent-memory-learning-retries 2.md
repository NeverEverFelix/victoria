# Session: Idempotent memory learning retries

- Date: 2026-10-27
- Time: 15:53 America/New_York
- Status: Partial
- Scope: Prevent duplicate memory versions when a durable turn is retried and extraction paraphrases a fact differently.

## Outcome

Ordinary learned facts carrying the same source turn ID and category/key now keep the first current value across retries. Explicit correction and forget writes remain able to supersede facts, even when they inherit source-turn provenance.

## Work Completed

- Added source-turn/category/key idempotency to [memory-orchestrator.ts](../../src/agent/memory/memory-orchestrator.ts).
- Added a regression where a retried extraction produces a different paraphrase in [memory-orchestrator.test.ts](../../tests/unit/agent/memory-orchestrator.test.ts).
- Updated the F7 implementation notes in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md) and [test-plan.md](../../tests/test-plan.md).

## Decisions

- Idempotency applies to ordinary learning writes, not explicit `user_correction` or forgotten-marker writes.
- This improves retries within the existing durable turn worker. It does not add a separate post-response memory job or retention policy.

## Verification

- All 10 memory-orchestrator tests passed, including append-only forget-marker behavior.
- `npm run check` passed: 84 test files passed, 9 skipped; 755 tests passed, 24 skipped, 9 todo.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted experimental SQLite warnings.

## Unresolved

- Provider extraction still runs during turn execution. A separate durable extraction queue would need its own persisted task state, retry policy, and safe retention treatment for source messages.
- The worktree contains other in-progress changes from earlier sessions; this entry covers only the idempotent retry slice.

## Recommended Next Step

- Review whether separate memory-task persistence is required for product reliability; if so, design it explicitly rather than overloading the turn result payload or silently storing another copy of user messages.
