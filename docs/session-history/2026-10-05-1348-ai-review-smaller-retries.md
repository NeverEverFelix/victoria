# Session: AI Review Smaller Retries

- Date: 2026-10-05
- Time: 13:48 EDT
- Status: Completed
- Scope: Address the AI review workflow failure observed on the multi-agent readiness PR.

## Outcome

The PR AI review returned no findings because a response exceeded its token limit after the chunk had reached the reviewer's 2,000-character retry floor. The reviewer can now keep splitting failed chunks down to 500 characters while retaining the complete-coverage requirement.

## Work Completed

- Lowered the minimum chunk size accepted by the review splitter and retry helper to 500 characters in [AI review core](../../scripts/ai-code-review-core.mjs).
- Added a regression test that retries a previously unsplittable sub-2,000-character chunk and verifies the original diff remains fully covered in [AI review core tests](../../tests/unit/scripts/ai-code-review-core.test.mjs).
- Updated configuration guidance in [GitHub setup](../github-setup.md).

## Decisions

- AI review must still complete every pass before posting a comment. Splitting smaller does not permit partial findings.
- If the output limit is still exceeded at 500 characters or the configured pass cap is reached, the workflow continues to fail without posting an incomplete review.

## Verification

- Focused test passed (13 tests).
- `npm run check` passed: 23 test files passed, 1 skipped; 243 tests passed, 1 todo.
- `git diff --check` passed.

## Unresolved

- The first full-product PR's AI review did not return code findings; it exhausted its output budget before posting. The new PR will provide a smaller-diff review run against this retry fix.

## Recommended Next Step

Review the AI findings on the focused PR when the updated review workflow completes, address any actionable findings, then merge that PR.
