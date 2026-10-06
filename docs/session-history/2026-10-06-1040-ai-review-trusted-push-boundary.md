# Session: Keep secret-bearing reviews on trusted pushes

- Date: 2026-10-06
- Time: 10:40 America/New_York
- Status: Completed locally; security follow-up PR pending
- Scope: Fix the high-severity issue found by the post-merge full-diff AI review.

## Outcome

The full-diff review completed in 37 seconds and covered all 50,258 diff characters across four passes. It found that triggering the secret-bearing push job on every branch could execute untrusted branch workflow code with `OPENAI_API_KEY`. PR commit pushes are already reviewed by `pull_request_target` on `synchronize`, using trusted base code and diff-only input. The standalone secret-bearing push trigger is now restricted to `main`.

## Work Completed

- Restricted the AI review `push` trigger to `main` in [.github/workflows/ai-code-review.yml](../../.github/workflows/ai-code-review.yml).
- Clarified the trusted-code and per-PR-commit behavior in [README.md](../../README.md) and [docs/github-setup.md](../github-setup.md).
- Added a setup-validator regression test against an all-branch secret-bearing push trigger in [tests/unit/scripts/validate-agentic-setup.test.ts](../../tests/unit/scripts/validate-agentic-setup.test.ts).
- Updated expected trigger coverage in [tests/test-plan.md](../../tests/test-plan.md).
- PR #10 merged as `203bdee9f81e188736a3f84242b91ed6d497dcde` after CI passed and GPT-5 low-reasoning review completed.

## Decisions

- Confirmed implementation: each PR update, including each commit pushed to an open PR, triggers the trusted `pull_request_target` review. Secret-bearing push reviews run only on `main`.
- Confirmed implementation: GPT-5 low reasoning effort fixes output-budget exhaustion; the original chunk, output, API-call, and job-time bounds remain in place.
- The AI review also returned lower-severity false positives about reverted settings, the existing retry test, and the `pull_request_target` trusted-ref path; these were checked against the workflow and code before proceeding.

## Verification

- `npm run check` — passed: setup validation, lint, type checks, and 251 tests; one skipped and one todo. Two test files remain skipped.
- Workflow YAML parse — passed.
- `git diff --check` — passed.
- Post-merge run `37480609958` — passed in 37 seconds; complete coverage of 50,258 diff characters across four passes.
- Local security follow-up checks passed; its PR and post-merge run remain outstanding.

## Unresolved

- Commit and push this security follow-up, open PR, inspect its checks, and merge.
- Verify the follow-up's post-merge review confirms the `main`-only push trigger.

## Recommended Next Step

Publish the focused push-trigger security fix and verify the resulting main-branch run.
