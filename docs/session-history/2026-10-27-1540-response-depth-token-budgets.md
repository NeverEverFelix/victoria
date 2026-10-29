# Session: Response Depth Token Budgets

- Date: 2026-10-27
- Time: 15:40 America/New_York
- Status: Completed
- Scope: Continue the conversational-core review by bounding model output according to the requested read-only response depth.

## Outcome

The OpenAI conversation responder now sends a 256-token output budget for brief replies and a 1,200-token budget for explicitly detailed replies. Both modes continue through the same grounding and financial/action validation; existing 1,500/4,000-character limits remain as final guards.

## Work Completed

- Added the `max_output_tokens` setting in [`src/agent/conversation-responder.ts`](../../src/agent/conversation-responder.ts).
- Extended [`tests/unit/agent/conversation-responder.test.ts`](../../tests/unit/agent/conversation-responder.test.ts) to verify both request budgets.
- Updated F3 in [`docs/VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md`](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md) and the expected coverage in [`tests/test-plan.md`](../test-plan.md).

## Decisions

- The current two-mode contract remains `brief` and `detailed`; no complexity classifier or persisted response-style preference was added.
- Token caps supplement the existing character validation and do not relax the read-only or amount-grounding checks.

## Verification

- `npx vitest run tests/unit/agent/conversation-responder.test.ts` — passed (15 tests).
- `npm run typecheck:test` — passed.
- `npm run check` — passed (84 test files passed, 9 skipped; 750 tests passed, 24 skipped, 9 todo).
- Lint retains the existing `_observedThrough` warning in `tests/unit/agent/memory-orchestrator.test.ts`; tests emit the existing experimental SQLite warning.
- `git diff --check` — passed.

## Unresolved

- Detailed response depth is inferred from explicit wording; complexity-based `normal` mode and memory-based style preference are not implemented.
- The combined worktree contains earlier conversational-memory, provenance, queued-turn and route changes and remains uncommitted.

## Recommended Next Step

Choose a single remaining finding and establish its acceptance behavior before changing broad orchestration. Keep the conversation responder read-only and preserve exact-action approval gates.
