# Session: Intent and Advisory Disagreement Evaluation

- Date: 2026-11-03
- Time: 22:03 America/New_York
- Status: Partial
- Scope: Add a frozen regression evaluation for deterministic intent versus advisory interpretation, and fix an advice question that could be misread as a savings proposal.

## Outcome

A fixed six-case evaluation now exercises advisory validation, shadow disagreement reporting, and turn coordination across read-only advice, record requests, uncertain agreement, historical/negated transfer language, and plain dialogue. It exposed and fixed a routing error: a “Should I put the extra money toward debt?” question could match direct proposal wording. Budgeting-advice questions are now excluded from direct proposal parsing.

## Work Completed

- Added the versioned, SHA-256-guarded fixture [`tests/evaluation/fixtures/conversation-intent-disagreement-v1.json`](../../tests/evaluation/fixtures/conversation-intent-disagreement-v1.json) and runner [`tests/evaluation/conversation-intent-disagreement.test.ts`](../../tests/evaluation/conversation-intent-disagreement.test.ts).
- Added an offline regression in [`src/agent/conversation-intent-plan.ts`](../../src/agent/conversation-intent-plan.ts) and [`tests/unit/agent/conversation-intent-plan.test.ts`](../../tests/unit/agent/conversation-intent-plan.test.ts) so advice questions that mention putting money toward debt remain read-only.
- Updated [`tests/evaluation/README.md`](../../tests/evaluation/README.md) to distinguish this scripted regression corpus from live model-quality evidence; updated the F-02/F-03 status in [`docs/architecture/conversation-architecture-review-2026-11-01-follow-up.md`](../architecture/conversation-architecture-review-2026-11-01-follow-up.md).

## Decisions

- Advisory plans remain untrusted: the coordinator's action description continues to come from the deterministic plan, and approval remains a separate deterministic gate.
- The six scripted advisory plans are a fixed regression set derived from the review and previous development. They are not a held-out corpus and are not evidence of live model quality.
- F-03 remains partial pending an independently labeled holdout and human review. F-06 also remains partial pending human evaluation of response depth, multi-intent quality, and fallback behavior.

## Verification

- Focused intent-plan and disagreement evaluation tests: 52 passed.
- `npm run check`: passed agent validation, lint, source and test type checks, and full suite (129 files passed, 9 skipped; 1,138 tests passed, 29 skipped, 9 todo).
- The six-case disagreement evaluation passed; its corpus hash is asserted by the test.
- Existing Node SQLite experimental warnings remain.

## Unresolved

- F-01 remains partial; common response composition across workflow paths is still outstanding.
- F-03 needs an independently labeled held-out paraphrase set and human evaluation.
- F-04 still needs structured open-question/constraint lifecycle and richer topic resolution.
- F-05 cross-session financial-history retrieval remains open.
- F-06 needs held-out and human quality evaluation.
- F-07 needs blinded human quality review before deciding specialist routing.
- F-08 remains deferred by the mock-ledger MVP boundary.
- F-10 requires the repository owner to replace the invalid Actions API secret and rerun the review job.
- The worktree contains other repository changes and staged deletions of duplicate ` 2` snapshots; preserve those unrelated changes.

## Recommended Next Step

Prepare a separate, independently labeled paraphrase holdout and report routing, intent, action, and unsafe-disagreement counts without using it to tune the rules in the same pass.
