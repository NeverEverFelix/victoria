# Session: Keep GPT-5 reasoning within the review budget

- Date: 2026-10-06
- Time: 10:36 America/New_York
- Status: Completed locally; PR update pending
- Scope: Fix repeated AI review output truncation at its source and restore the existing workflow bounds.

## Outcome

The Responses API counts both reasoning and visible answer tokens against `max_output_tokens`. GPT-5 defaults to medium reasoning effort, which could consume the review pass's output allowance before concise findings were returned. Review requests now use low reasoning effort, and repository review bounds have been restored to their prior settings.

## Work Completed

- Added `reasoning: { effort: "low" }` to GPT-5 review requests through the tested request builder in [scripts/ai-code-review-core.mjs](../../scripts/ai-code-review-core.mjs) and [scripts/ai-code-review.mjs](../../scripts/ai-code-review.mjs).
- Print completed push-review results to the Actions log as well as the job summary so findings can be inspected without the browser.
- Restored workflow defaults to 18,000 diff characters, 2,000 output tokens, 24 review passes, and a 10-minute trusted-push job timeout in [.github/workflows/ai-code-review.yml](../../.github/workflows/ai-code-review.yml).
- Restored the repository `AI_REVIEW_MAX_CHUNKS` variable from the temporary diagnostic value 96 to its original value 40.
- Added a request-contract regression test and updated [README.md](../../README.md), [docs/github-setup.md](../github-setup.md), and [tests/test-plan.md](../../tests/test-plan.md).

## Decisions

- Confirmed implementation: constrain GPT-5 reasoning effort instead of increasing token, chunk, or time limits.
- Confirmed implementation: preserve five-way pass concurrency and existing complete-coverage/no-partial-review behavior.
- The low reasoning setting is supported by the [Responses API reference](https://platform.openai.com/docs/api-reference/responses), which documents low effort and that the output-token bound includes reasoning and visible output.

## Verification

- `npm run check` — passed: setup validation, lint, type checks, and 250 tests; one skipped and one todo. Two test files remain skipped.
- Workflow YAML parse — passed.
- `git diff --check` — passed.
- A prior push-triggered run using the 500-character diagnostic retry completed in 2m7s. That run reviewed only the follow-up commit, not the complete PR. The new low-reasoning request must be pushed and exercised on the complete PR diff before considering this fixed.

## Unresolved

- Commit and push this root-cause fix.
- Inspect the full-diff run's findings in the Actions log and confirm the PR review/checks before merging.

## Recommended Next Step

Push this correction to PR #10, inspect the full-diff AI output and CI, then merge and verify the post-merge review workflow.
