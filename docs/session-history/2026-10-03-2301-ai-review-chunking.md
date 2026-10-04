# Session: Complete AI Review Coverage

- Date: 2026-10-03
- Time: 23:01 EDT
- Status: Completed
- Scope: Replace the AI PR reviewer's recurring whole-diff size failure with bounded complete review passes.

## Outcome

Large PR diffs are reviewed in bounded passes. The reviewer posts one complete-coverage comment only after every pass returns; it fails without publishing a partial result when configured limits or model response limits are exceeded.

## Work Completed

- Added source-preserving diff chunking and coverage checks in [review core](../../scripts/ai-code-review-core.mjs).
- Updated [review workflow](../../.github/workflows/ai-code-review.yml) and [review runner](../../scripts/ai-code-review.mjs) to use the PR's exact base commit for trusted product context, process all chunks, and publish only the complete result.
- Added coverage, oversized-diff, publication guard, and trusted-base validator tests in [review core tests](../../tests/unit/scripts/ai-code-review-core.test.mjs) and [setup validator tests](../../tests/unit/scripts/validate-agentic-setup.test.ts).
- Updated [GitHub setup guidance](../github-setup.md) and [README](../../README.md).
- Preserved the prior PR merge record at [2026-10-03-2231-pr-review-merge.md](2026-10-03-2231-pr-review-merge.md).

## Decisions

- Confirmed implementation: the default 60,000-character limit applies to each review pass, not the entire PR. A separate default cap of 12 passes bounds review cost.
- Confirmed implementation: trusted product instructions are loaded from the PR's exact base commit; proposed changes remain untrusted diff data.
- Confirmed implementation: do not publish a partial review if any pass is incomplete, a pass limit is exceeded, or the full comment exceeds its size cap.
- Proposal for review: tune the pass-count cap after observing real PR sizes and model latency.

## Verification

- `npm run check` passed, including agent setup validation, lint, typechecks, and unit tests. Two existing unused-parameter lint warnings remain in `src/agent/memory/mock-memory.ts`; 20 tests remain todo and one test file is skipped.
- The regression test covers a roughly 256k-character diff with five passes and checks complete character coverage.
- `git diff --check` passed.
- The local AI review skip path was checked without an API key; a live OpenAI review was not run locally.

## Unresolved

- Changes are on local branch `fix/ai-review-complete-coverage`; not yet committed or pushed for GitHub Actions review.
- The reviewer has not yet been exercised against a live large PR after deployment.

## Recommended Next Step

- Commit and publish this branch as a small follow-up PR, then inspect the new review workflow's coverage report and CI results.
