# Session: PR Review Product Behavior Context

- Date: 2026-10-03
- Time: 20:38 EDT
- Status: Completed
- Scope: Give the automated pull-request reviewer the authoritative MVP behavior contract as trusted review context.

## Outcome

The PR reviewer now receives the MVP scope, user stories, normative safety contract, and behavior test plan from the default branch, alongside repository instructions, coding patterns, and product decisions. The PR diff remains untrusted review evidence.

## Work Completed

- Extended [ai-code-review-core.mjs](../../scripts/ai-code-review-core.mjs) to include explicit sections for the product and behavior sources.
- Updated [ai-code-review.mjs](../../scripts/ai-code-review.mjs) to load those files from the trusted default-branch checkout.
- Added checks for the new trusted context in [ai-code-review-core.test.mjs](../../tests/unit/scripts/ai-code-review-core.test.mjs).
- Documented the review inputs in [github-setup.md](../github-setup.md).

## Decisions

- Confirmed review behavior: expected product behavior comes from `docs/mvp.md`, `docs/user-stories.md`, `docs/specification/mvp-safety-contract.md`, and `tests/test-plan.md`, with `docs/decisions.md` for accepted product decisions. Pull request content remains untrusted.

## Verification

- Focused AI review core tests passed: 5 tests.
- `npm run check` passed: setup validation and both typechecks passed; 129 tests passed, 20 todo, and 1 test file skipped.
- Lint reports three existing warnings in mock memory and policy tests.

## Unresolved

- The current change is local and still needs to be committed and pushed before the PR workflow can consume it.
- The user requested branch merge and PR review, but the intended sequence (review before merge or merge before review) is awaiting clarification.

## Recommended Next Step

- After clarifying sequence, commit and push this review-context improvement, then open the PR to trigger the review workflow. Merge only after reviewing the PR findings unless the user explicitly chooses immediate merge.
