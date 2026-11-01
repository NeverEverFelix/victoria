# Session: Apply validated AI review fixes

- Date: 2026-10-26
- Time: 18:08 America/New_York
- Status: Completed
- Scope: Triage the PR AI review and fix findings that exposed real conversation-scoping or safety-validation gaps.

## Outcome

Conversation event identity now matches the user-and-conversation scope in both PostgreSQL and in-memory stores. Read-only reply validation now rejects financial amounts sourced only from memory or generated baseline text, and rejects common real-transfer promises. Approximate amount wording cannot satisfy an exact pending-proposal revision. The PR-wide AI review also reported multiple findings that were stale or contradicted by current code and contract; those were not applied blindly.

## Work Completed

- Changed the event key to `(user_id, conversation_id, event_id)` and aligned event store lookups and conflict handling in [the PostgreSQL event store](../../src/app/savings/postgres-conversation-savings-event-store.ts), [the in-memory event store](../../src/agent/savings-event-store.ts), and both migration copies.
- Tightened [conversation reply validation](../../src/agent/conversation-responder.ts) so generated amounts must match the current/recent user text or a structured user-provided event amount; added wire, ACH, Zelle, bank-transfer, and cash-withdrawal promise checks.
- Required exact amount wording for a pending proposal revision and updated APR-005 plus the [test plan](../../tests/test-plan.md).
- Corrected the event-context test to inspect each event for forbidden approval fields and bounded/sanitized merchant names before including them in model context.

## Decisions

- Kept the documented INT-005 planning behavior: a clearly ended recurring personal cost may inform a conditional planning proposal, while annual projections remain separate from the current mocked-ledger amount and every write still requires fresh approval.
- Did not apply the AI review's entry-correction “critical” finding because the returned recorded correction is only produced after the pending correction passes approval and the correction tool succeeds.
- Did not add trigger-function DDL to migrations 0022/0023 because the prerequisite function is defined in migration 0011 and precedes them in the migration order.

## Verification

- `npm run check`: passed; 77 test files passed, 8 skipped; 708 tests passed, 22 skipped, 9 todo.
- `git diff --check`: passed.
- Existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`.

## Unresolved

- AI review findings still require human review where they challenge broader provider-default and episodic-learning decisions across the PR.
- The updated commit and resulting AI review are pending.

## Recommended Next Step

Commit and push these fixes to PR #20, then inspect the new AI review for remaining actionable findings.
