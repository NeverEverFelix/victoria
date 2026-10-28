# Session: Focused Conversation Fallback

- Date: 2026-10-27
- Time: 15:44 America/New_York
- Status: Completed
- Scope: Improve F5 fallback quality for a small set of ordinary read-only conversation topics while preserving pending financial workflows.

## Outcome

When response generation fails in a no-action conversation without validated financial facts or savings-event history, Victoria now asks a focused follow-up for recognized evening, grocery, or weekend topics. Context containing a pending action/workflow, validated financial facts, or historical savings events keeps its original deterministic baseline.

## Work Completed

- Added `deterministicConversationFallback` in [`src/agent/victoria-agent.ts`](../../src/agent/victoria-agent.ts).
- Added tests for failed ordinary replies and invalid drafts during a pending savings proposal. The pending action remains unrecorded until the subsequent explicit approval.
- Updated F5 and [`tests/test-plan.md`](../test-plan.md) to mark the narrow fallback behavior and remaining limitations.

## Decisions

- Keep the fallback topic set deliberately small and deterministic; do not synthesize financial facts or alter financial/action-sensitive baselines.
- Existing one-retry behavior and privacy-safe fallback telemetry remain in place.

## Verification

- `npx vitest run tests/unit/agent/conversation-responder.test.ts` — passed (17 tests).
- `npm run check` — passed (84 test files passed, 9 skipped; 752 tests passed, 24 skipped, 9 todo).
- Existing `_observedThrough` lint warning and experimental SQLite test warnings remain.
- `git diff --check` — passed.

## Unresolved

- Focused fallback templates cover only evenings, groceries, and weekends; other topics still use their deterministic baseline.
- Financial read-only fallback and broader recovery policies remain open.
- The combined worktree includes prior conversational-core work and remains uncommitted.

## Recommended Next Step

Add or revise one topic-specific fallback only when an acceptance test demonstrates a repeated generic-baseline failure; keep action-sensitive routes deterministic and approval-gated.
