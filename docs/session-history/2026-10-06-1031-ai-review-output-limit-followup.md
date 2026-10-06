# Session: Remove the AI review retry floor

- Date: 2026-10-06
- Time: 10:31 America/New_York
- Status: Completed locally; PR follow-up pending
- Scope: Address the live review failure caused by the repository's 40-call override and the reviewer's 2,000-character retry floor.

## Outcome

The first workflow run failed with `AI_REVIEW_OUTPUT_LIMIT` after splitting a review pass below the 2,000-character retry floor. The repository also had `AI_REVIEW_MAX_CHUNKS=40`, overriding the newly documented default of 96. Raised that repository variable to 96 and allowed adaptive subdivision down to 500 characters.

## Work Completed

- Updated repository variable `AI_REVIEW_MAX_CHUNKS` from 40 to 96.
- Changed the minimum pass size and adaptive retry threshold to 500 characters in [scripts/ai-code-review-core.mjs](../../scripts/ai-code-review-core.mjs).
- Added regression coverage for repeated subdivision below 2,000 characters in [tests/unit/scripts/ai-code-review-core.test.mjs](../../tests/unit/scripts/ai-code-review-core.test.mjs).
- Updated the configured minimum and retry behavior in [docs/github-setup.md](../github-setup.md), [README.md](../../README.md), and [tests/test-plan.md](../../tests/test-plan.md).

## Decisions

- Confirmed implementation: retry passes down to 500 characters while keeping complete-coverage and finite-call safeguards.
- Confirmed repository configuration: the total API-call ceiling is 96; lower overrides can prevent adaptive retries from finishing.

## Verification

- `npm run check` — passed: setup validation, lint, type checks, and 250 tests; one skipped and one todo. Two test files remain skipped.
- `node` YAML parse of `.github/workflows/ai-code-review.yml` — passed before this follow-up; this follow-up does not change YAML.
- `git diff --check` — passed.
- Live PR review on commit `779baa8` remains in progress; its push-triggered review failed at the 2,000-character floor. The new commit must be reviewed before merging.

## Unresolved

- Verify the new PR review completes and inspect its posted findings.
- Changes are local and not yet committed at the time of this entry.

## Recommended Next Step

Commit and push this follow-up, then inspect the fresh PR-triggered AI review and checks before merging PR #10.
