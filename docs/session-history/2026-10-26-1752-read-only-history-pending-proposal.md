# Session: Read-only event history during a pending proposal

- Date: 2026-10-26
- Time: 17:52 America/New_York
- Status: Completed
- Scope: Allow a narrow, read-only event-history question to use scoped savings event context while a savings proposal remains pending.

## Outcome

A clearly read-only event-history question can now be answered while a savings proposal is pending. The exception is limited to history questions and passes only the bounded event projection for the exact user and conversation to the read-only Conversation Responder. Approval, decline, ambiguous approval, and revision gates remain in place.

## Work Completed

- Added deterministic history-question detection and an early read-only response path in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added scoped historical-event context to [ConversationResponder](../../src/agent/conversation-responder.ts) and constrained its prompt to those events.
- Added behavior tests for pending-state preservation, later explicit approval, no scoped-event context for mixed action questions, and provider handoff.
- Updated [APR-004](../specification/mvp-safety-contract.md), [Story 25](../user-stories.md), and the [test plan](../../tests/test-plan.md).

## Decisions

- A question must clearly ask about historical events and must not contain active action, approval, decline, revision, or ambiguous approval intent to use this path.
- The read-only reply cannot change or cancel the pending proposal. The user still must explicitly approve the exact pending proposal before a ledger write.

## Verification

- `npm run check`: passed; 77 test files passed, 703 tests passed, 22 skipped, 9 todo. Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`.
- Live provider-backed local HTTP challenge against `victoria_integration_local`: event-history question answered while pending, with zero ledger entries; a “Maybe. Should I record it?” turn required a clear yes or no and left the ledger empty; a later explicit “Yes” recorded exactly 1800 cents in `mock_ledger`.
- `git diff --check`: passed.
- No staging or production systems were accessed and no real money moved.

## Unresolved

- General read-only questions while other pending workflows (goal allocation or entry correction) remain on their existing paths; this slice covers pending savings proposals only.
- Natural-language reference resolution for historical-event revisions remains a separate next slice.
- Changes remain uncommitted.

## Recommended Next Step

Proceed with deterministic unique/ambiguous/no-match resolution for historical-event references, then challenge the result against repeated merchants and similar events while preserving exact-action fresh approval.
