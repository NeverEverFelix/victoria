# Session: Plaid Review Status Follow-up

- Date: 2026-10-15
- Time: 19:04 America/New_York
- Status: Partial
- Scope: Record the CI and AI review results after the lifecycle fixes were pushed to PR #16.

## Outcome

The update at commit `9d11c87` is pushed to PR #16. Local `npm run check`, both PR CI runs, and the PR-triggered AI review completed successfully. The PR remains open and unmerged.

## Work Completed

- Recorded the review results and remaining questions after [the lifecycle review fixes](2026-10-15-1901-plaid-review-fixes.md).
- The latest AI review reported a mismatch in `tests/test-plan.md`: it says pushes to every branch trigger AI review, while `.github/workflows/ai-code-review.yml` runs the secret-bearing push review only on `main` and PR review through `pull_request_target`.
- The AI review also questioned the date-only 90-day expiry and migration backfill. `transaction_date` is `NOT NULL` in migration 0005, and the confirmed policy specifies retention by transaction date. No code change was made for these findings pending product-owner review.
- The purge function return-count observation is potentially useful for monitoring accuracy, but its return value is currently ignored by the disconnect caller.

## Decisions

- Existing confirmed lifecycle policy remains unchanged.
- New findings from the latest AI review are awaiting user direction before further fixes.
- The PR will not be merged in this session.

## Verification

- `npm run check`: passed locally (54 test files passed, 6 skipped; 443 tests passed, 4 skipped, 9 todo).
- PR CI on commit `9d11c87`: both runs succeeded.
- PR-triggered AI review on commit `9d11c87`: completed with full coverage.
- Existing lint warning: `_observedThrough` is unused in `tests/unit/agent/memory-orchestrator.test.ts` line 48.
- No live Plaid or database calls were made.

## Unresolved

- Whether to correct the AI review workflow wording in `tests/test-plan.md`.
- Whether to change purge row-count reporting.
- Authenticated deployment routes, lifecycle scheduling, live database verification, and controlled key-rotation rehearsal remain deployment gates.

## Recommended Next Step

Review the PR findings and decide whether to address the documentation mismatch and purge row-count reporting. Keep live Plaid reads disabled until deployment gates are complete.
