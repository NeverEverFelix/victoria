# Session: Split AI reviews into smaller passes

- Date: 2026-10-04
- Time: 14:26 America/New_York
- Status: Completed locally; pull request pending
- Scope: Stop large AI review passes from exhausting the bounded output-token budget.

## Outcome

Confirmed PR #3 was reviewed by trusted code from the latest `main` commit, but the model still exhausted 4,000 output tokens while handling its 60,000-character pass. Reduced the default diff segment size to 18,000 characters and raised the bounded default pass count to 20. Measured PR #3 at 263,347 diff characters: the current chunker covers it completely in 18 passes of at most 17,975 characters.

## Work Completed

- Configured the AI review workflow to use `AI_REVIEW_MAX_DIFF_CHARS=18000` and `AI_REVIEW_MAX_CHUNKS=20` by default for PRs and trusted main pushes in [.github/workflows/ai-code-review.yml](../../.github/workflows/ai-code-review.yml).
- Documented those size and cost bounds in [docs/github-setup.md](../github-setup.md) and [README.md](../../README.md), and added the bounded-pass expectation to [tests/test-plan.md](../../tests/test-plan.md).
- Extended the setup validator and large-diff test to enforce complete coverage within the new per-pass limit.
- PR #4 (token budget) and PR #5 (concise output) are merged. PR #3 was rebased onto the resulting trusted `main`; its AI review still truncated at 4,000 tokens before this smaller-pass change.

## Decisions

- Keep review output concise, keep each diff pass at most 18,000 characters by default, cap total calls at 20, and preserve full-coverage/no-partial-post behavior.
- PR #3's `AI_REVIEW_MAX_OUTPUT_TOKENS` repository variable is set to 4,000. The code accepts 100–4,000.

## Verification

- `gh pr diff 3 | wc -c` — 263,753 bytes from the CLI; exact parsed diff length in the chunker was 263,347 characters.
- Chunker measurement at 18,000 characters — 18 chunks, maximum chunk 17,975 characters, complete coverage.
- `npm test -- tests/unit/scripts/ai-code-review-core.test.mjs` — passed, 11 tests.
- `npm run check` — passed: agentic validation, lint, type checks, and 153 tests; 20 todo and one skipped. Existing two unused-parameter lint warnings remain in `src/agent/memory/mock-memory.ts`.
- `git diff --check` — passed.

## Unresolved

- The smaller-pass workflow change has not yet been committed, pushed, or opened as a pull request.
- Rerun PR #3 after this change is merged and confirm that the complete review posts successfully, then inspect its findings before merging PR #3.
- AI review on a pull request introducing its own workflow/script fix may fail against the old trusted base; this job remains advisory because `AI_REVIEW_REQUIRED=false`. Required CI checks must still pass.

## Recommended Next Step

Open and merge this bounded-pass configuration fix after CI passes, update PR #3, and verify its full review and checks before merging.
