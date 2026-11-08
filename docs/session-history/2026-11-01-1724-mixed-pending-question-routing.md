# Session: Mixed Questions During Pending Savings Approval

- Date: 2026-11-01
- Time: 17:24 America/New_York
- Status: Partial
- Scope: Continue the conversation-architecture review by preserving independent questions during mixed confirmation turns.

## Outcome

Fixed a pending-proposal routing gap. When a user combines a confirmation attempt, an exact mocked-ledger request, and an independent read-only question, Victoria now sends the turn to the read-only responder. The pending proposal remains unchanged; a later standalone exact confirmation is still required before recording.

## Work Completed

- Updated [`src/agent/pending-savings-confirmation-service.ts`](../../src/agent/pending-savings-confirmation-service.ts) to route this narrow mixed-turn shape to the read-only response path.
- Added an integration test in [`tests/unit/agent/victoria-agent.test.ts`](../../tests/unit/agent/victoria-agent.test.ts) that verifies the question is answered, no entry exists after the mixed turn, and a later standalone “Yes” records the pending $35 entry.
- Updated [`tests/test-plan.md`](../../tests/test-plan.md) and the F-01 status in [`docs/architecture/conversation-architecture-review-2026-11-01-follow-up.md`](../architecture/conversation-architecture-review-2026-11-01-follow-up.md).

## Decisions

- This route applies only when the deterministic plan identifies a confirmation attempt, an explicit mock-ledger recording request, and a separate read-only question. General topic switches and other pending-workflow routing remain on their existing paths.
- The read-only reply cannot authorize a write. Ambiguous mixed turns preserve the pending proposal and require a later clear confirmation.

## Verification

- Focused Victoria agent suite: 203 tests passed.
- `npm run check`: passed agent validation, lint, source and test type checks, and full suite (125 files passed, 9 skipped; 1,111 tests passed, 29 skipped, 9 todo).
- `git diff --check HEAD`: passed.
- Existing Node SQLite experimental warnings remain.

## Unresolved

- F-01 remains partial: the coordinator does not yet own workflow outcome collection or universal response composition.
- F-04 and F-05 remain open: durable dialogue working state and cross-session financial-history retrieval are not implemented.
- F-03 and F-06 still need broader held-out and human evaluation.
- F-07 needs blinded human quality review before making the specialist-routing decision.
- F-08 remains deferred under the mock-ledger MVP boundary.
- F-10 requires the repository owner to replace the invalid Actions API secret and rerun the AI review job.
- This worktree contains other pre-existing changes and tracked snapshot deletions; preserve them.

## Recommended Next Step

Continue with a narrowly scoped durable dialogue-state design and persistence path. Keep it separate from transcript storage, long-term personal memory, and financial action authority; add source-linked tests for interrupted topics and corrections before enabling broader retrieval.
