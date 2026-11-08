# Session: Pending Workflow Intent Precision

- Date: 2026-11-02
- Time: 14:39 America/New_York
- Status: Partial
- Scope: Continue F-01 by correcting pending-workflow intent labeling for mixed confirmation and question turns.

## Outcome

Conversation intent planning no longer interprets every “yes, but…” phrase as a pending-proposal revision. Explicit edit language still produces a revision-request relation; a plain question after “yes, but” remains a reference to the pending workflow. The approval boundary is unchanged.

## Work Completed

- Narrowed revision wording in [`src/agent/conversation-intent-plan.ts`](../../src/agent/conversation-intent-plan.ts) to explicit edit language.
- Updated pending disposition naming in [`src/agent/conversation-turn-coordinator.ts`](../../src/agent/conversation-turn-coordinator.ts) so it describes a requested revision rather than implying a revision already occurred.
- Added/updated coordinator regression coverage in [`tests/unit/agent/conversation-turn-coordinator.test.ts`](../../tests/unit/agent/conversation-turn-coordinator.test.ts).
- Updated test contract and review status in [`tests/test-plan.md`](../../tests/test-plan.md) and [`docs/architecture/conversation-architecture-review-2026-11-01-follow-up.md`](../architecture/conversation-architecture-review-2026-11-01-follow-up.md).

## Decisions

- Descriptive intent labels cannot approve or execute a savings action.
- Independent questions mixed with attempted approval continue to leave the pending proposal untouched; a standalone exact confirmation is still required by the current safety contract.
- F-01 remains partial because turn context, workflow outcomes, and final response composition are still distributed across services.

## Verification

- Focused coordinator, intent-plan, and agent tests: 252 passed.
- `npm run check`: passed agent validation, lint, source and test type checks, and full suite (127 files passed, 9 skipped; 1,126 tests passed, 29 skipped, 9 todo).
- `git diff --check HEAD`: passed.
- Existing Node SQLite experimental warnings remain.

## Unresolved

- F-01 still needs a typed per-turn outcome/composition contract applied across all workflow paths.
- F-03 and F-06 need held-out and human evaluation.
- F-04 still needs structured open-question/constraint lifecycle and richer topic resolution.
- F-05 cross-session financial-history retrieval remains open.
- F-07 needs blinded human quality review before deciding specialist routing.
- F-08 remains deferred by the mock-ledger MVP boundary.
- F-10 requires the repository owner to replace the invalid Actions API secret and rerun the review job.
- The worktree contains other repository changes and staged deletions of duplicate ` 2` snapshots; preserve those unrelated changes.

## Recommended Next Step

Choose one response-producing workflow boundary and introduce a typed outcome result without changing approval, persistence, or idempotency behavior.
