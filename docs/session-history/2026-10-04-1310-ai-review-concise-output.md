# Session: Keep AI review responses within the token budget

- Date: 2026-10-04
- Time: 13:10 America/New_York
- Status: Completed locally; pull request pending
- Scope: Fix the remaining truncation of large pull-request AI reviews after the output budget became configurable.

## Outcome

Changed the AI reviewer to return concise, actionable findings only, with low response verbosity. This keeps review passes focused on findings while preserving complete diff coverage and the rule that incomplete responses are not posted.

## Work Completed

- Replaced the multi-section review response request with a concise finding-only format in [scripts/ai-code-review-core.mjs](../../scripts/ai-code-review-core.mjs).
- Set the Responses API verbosity to low in [scripts/ai-code-review.mjs](../../scripts/ai-code-review.mjs).
- Added regression assertions for the constrained output format in [tests/unit/scripts/ai-code-review-core.test.mjs](../../tests/unit/scripts/ai-code-review-core.test.mjs).
- This change follows merged PR #4, which made the per-pass output-token budget configurable. PR #3 has already been updated against that merge, but its AI review still truncated at the 4,000-token ceiling.

## Decisions

- Review output should include all actionable findings supported by each diff pass, in concise bullets, with no repeated tests/notes/summary sections.
- Do not post partial output if the provider still reports a truncated response.

## Verification

- `npm test -- tests/unit/scripts/ai-code-review-core.test.mjs` — passed, 11 tests.
- `npm run check` — passed: agentic validation, lint, type checks, and 153 tests; 20 todo and one skipped. Existing two unused-parameter lint warnings remain in `src/agent/memory/mock-memory.ts`.
- `git diff --check` — passed.

## Unresolved

- The output-format fix has not yet been committed, pushed, or opened as a pull request.
- The 4,000-token repository variable is set for PR #3. Once this change is merged, rerun PR #3's AI review and inspect the findings.
- No production multi-agent runtime work is included.

## Recommended Next Step

Open and merge the focused output-format fix after CI passes, rerun PR #3's AI review, inspect its findings, then merge PR #3 if no blocking issues remain.
