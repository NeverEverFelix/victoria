# Session: Retry truncated AI review passes at smaller size

- Date: 2026-10-04
- Time: 15:39 America/New_York
- Status: Completed locally; pull request pending
- Scope: Make the reviewer adapt when even an 18,000-character diff pass exceeds the response-token limit.

## Outcome

PR #3 ran the merged trusted reviewer with the concise prompt, 18,000-character passes, and a 4,000-token response ceiling. It still failed because one pass exhausted the output budget. Added adaptive splitting so only that pass is divided and retried, subject to the total configured pass cap.

## Work Completed

- Added `splitReviewChunkForRetry` in [scripts/ai-code-review-core.mjs](../../scripts/ai-code-review-core.mjs) and wired the review loop in [scripts/ai-code-review.mjs](../../scripts/ai-code-review.mjs) to split an over-budget pass in half and retry it.
- Increased the default total pass cap to 24, covering adaptive retries; documented the cap in [README.md](../../README.md) and [docs/github-setup.md](../github-setup.md).
- Added unit coverage for the split and complete character coverage in [tests/unit/scripts/ai-code-review-core.test.mjs](../../tests/unit/scripts/ai-code-review-core.test.mjs), and guarded the code contract in [scripts/validate-agentic-setup.mjs](../../scripts/validate-agentic-setup.mjs).
- PR #6 (18,000-character passes) was merged after CI passed and its AI review completed with full coverage and no findings. PR #3's subsequent run used that trusted main code, but still exhausted output tokens on one pass.

## Decisions

- On `max_output_tokens`, split only the overflowing pass, retain all already-completed reviews, and retry the smaller pieces.
- Never post partial output. If a pass cannot be subdivided or the total pass cap would be exceeded, fail the whole review.

## Verification

- `npm test -- tests/unit/scripts/ai-code-review-core.test.mjs` — passed, 12 tests.
- `npm run check` — passed: agentic validation, lint, type checks, and 154 tests; 20 todo and one skipped. Existing two unused-parameter lint warnings remain in `src/agent/memory/mock-memory.ts`.
- `git diff --check` — passed.

## Unresolved

- The adaptive retry change has not yet been committed, pushed, or opened as a pull request.
- Re-run PR #3 after this fix is merged; confirm all findings are posted with complete coverage, inspect them, and only then merge PR #3.
- AI review remains optional because `AI_REVIEW_REQUIRED=false`; required CI checks still gate merges.

## Recommended Next Step

Open the adaptive retry fix as a focused PR, verify its CI and review, merge it, then update PR #3 and inspect the complete AI review before merging it.
