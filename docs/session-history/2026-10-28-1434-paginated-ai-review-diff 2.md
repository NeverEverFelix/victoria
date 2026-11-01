# Session: Paginate large pull-request AI review diffs

- Date: 2026-10-28
- Time: 14:34 EDT
- Status: Completed
- Scope: Repair AI review on PRs with more than 300 changed files while preserving the trusted-base/untrusted-diff boundary.

## Outcome

The AI review workflow no longer requests GitHub's whole-PR diff endpoint, which rejects pull requests beyond 300 changed files. It now fetches changed-file records page by page, reconstructs textual diff sections, and fails closed when a file lacks a patch or the 3,000-file page cap is reached.

## Work Completed

- Replaced the capped diff request with `fetchPullRequestFilesDiff` and `formatPullRequestFilesDiff` in [ai-code-review.mjs](../../scripts/ai-code-review.mjs) and [ai-code-review-core.mjs](../../scripts/ai-code-review-core.mjs).
- Added tests for pagination, modified/added/removed/renamed files, and missing patches in [ai-code-review-core.test.mjs](../../tests/unit/scripts/ai-code-review-core.test.mjs).
- Updated the agentic setup validator and its regression test so the old capped endpoint cannot return unnoticed.
- Updated the conversational review's F11 section and [test-plan.md](../test-plan.md) with the failure and recovery behavior.

## Decisions

- The `pull_request_target` job continues to execute only trusted base-branch workflow code; it fetches patch data as untrusted content and never checks out or executes the PR head.
- Any incomplete changed-file patch set prevents AI review from publishing a partial-complete claim.

## Verification

- Focused AI-review core and setup-validator tests passed: 24 tests.
- `npm run check` passed: 89 test files passed, 9 skipped; 839 tests passed, 25 skipped, 9 todo.
- `git diff --check` passed.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts`; Node emits experimental SQLite warnings.
- Before this fix, PR #20's latest `Review PR` job failed at GitHub's diff endpoint with HTTP 406 because the PR exceeded 300 changed files. The separate CI job passed. A fresh AI review must complete on the updated head before F11 is resolved.

## Unresolved

- The current AI-review findings are not yet available for the latest PR head because its workflow failed before requesting model analysis.
- PR #20 is stacked on PR #19; PR #19 remains open against `main`.

## Recommended Next Step

- Push this fix to PR #20, verify its exact-head AI-review and CI jobs, address actionable findings, and then merge the PR into its existing target branch.
