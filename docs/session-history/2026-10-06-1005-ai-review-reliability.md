# Session: Improve AI review reliability and coverage

- Date: 2026-10-06
- Time: 10:05 America/New_York
- Status: Completed locally
- Scope: Run AI review for every pull request update and branch push, while reducing serial review latency and output-limit failures.

## Outcome

The AI review workflow now triggers on pull request open/reopen/synchronize/ready/edit events and pushes to every branch. Bounded review passes run concurrently, with a larger default output budget and adaptive retries for truncated passes.

## Work Completed

- Expanded triggers and per-job timeouts in [.github/workflows/ai-code-review.yml](../../.github/workflows/ai-code-review.yml).
- Increased the default output budget to 4,000 tokens, reduced each initial diff pass to 12,000 characters, added five-way bounded concurrency, and raised the finite total API-call ceiling to 96 in [scripts/ai-code-review.mjs](../../scripts/ai-code-review.mjs) and [scripts/ai-code-review-core.mjs](../../scripts/ai-code-review-core.mjs).
- Updated workflow validation, expectations, and setup documentation in [scripts/validate-agentic-setup.mjs](../../scripts/validate-agentic-setup.mjs), [tests/test-plan.md](../../tests/test-plan.md), [README.md](../../README.md), and [docs/github-setup.md](../github-setup.md).

## Decisions

- Confirmed implementation: review every PR open/reopen/synchronize/ready/edit event and branch push. Pushes are analyzed as the event's before-to-after diff.
- Confirmed implementation: keep complete-coverage publication and a finite total API-call cap while concurrently processing up to five passes.
- The API key remains a repository secret; the PR head is still never checked out or executed by the secret-bearing workflow.

## Verification

- `node` YAML parse of `.github/workflows/ai-code-review.yml` — passed.
- `npm run check` — passed: setup validation, lint, type checks, and 249 tests; one skipped and one todo test. Two test files remain skipped.
- `git diff --check` — passed.
- A live GitHub Actions/OpenAI run was not available from this local change; confirm the next PR and branch push post complete reviews.

## Unresolved

- The workflow still depends on the repository having `OPENAI_API_KEY`; without it, configured optional behavior skips review.
- The 96-call cap and concurrency 5 have not yet been observed on a live large PR.
- Changes are local and uncommitted.

## Recommended Next Step

Commit and push the change, then verify the AI review job runs on the resulting PR and its next branch push, including a complete coverage result without output-limit failure.
