# Session: Conversation Fallback Observability

- Date: 2026-10-27
- Time: 15:42 America/New_York
- Status: Completed
- Scope: Continue the conversational-core review by exposing privacy-safe reasons when a read-only response falls back after provider failure or rejected drafts.

## Outcome

An optional VictoriaAgent observer now receives only `provider_error` or `invalid_after_retry` when a conversation response falls back. The existing one-retry behavior and deterministic baseline remain unchanged.

## Work Completed

- Added `onConversationReplyFallback` in [`src/agent/victoria-agent.ts`](../../src/agent/victoria-agent.ts), with a closed reason union and best-effort callback handling.
- Added tests for provider exceptions and repeated invalid action-claiming drafts; the observer receives no user message, provider error, or draft text.
- Updated F5 and expected behavior in [`docs/VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md`](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md) and [`tests/test-plan.md`](../test-plan.md).

## Decisions

- Keep deterministic baseline replies when generation fails; the callback adds observability without changing response semantics or financial authority.
- The observer is an instrumentation seam only. No metrics backend was configured.

## Verification

- `npx vitest run tests/unit/agent/conversation-responder.test.ts` — passed (16 tests).
- `npm run typecheck:test` — passed.
- `npm run check` — passed (84 test files passed, 9 skipped; 751 tests passed, 24 skipped, 9 todo).
- Existing lint warning for `_observedThrough` remains; Node emits experimental SQLite warnings in tests.
- `git diff --check` — passed.

## Unresolved

- The deterministic baseline can still be generic and may not answer a user's actual read-only question. Recovery policies and grounded fallback composition remain open.
- The combined worktree contains the earlier conversational-core and queued-turn changes and remains uncommitted.

## Recommended Next Step

Choose a concrete read-only fallback case and design a focused safe response policy; keep pending-action prompts and mutation approval paths on their existing deterministic gates.
