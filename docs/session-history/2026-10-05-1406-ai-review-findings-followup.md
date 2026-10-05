# Session: AI Review Findings Follow-up

- Date: 2026-10-05
- Time: 14:06 EDT
- Status: Completed
- Scope: Address the actionable review-tool findings from PR #8 and correct the initial session note without rewriting append-only history.

## Outcome

The AI review completed on PR #8. It found that the first implementation lowered both the configured review-size minimum and the source-content safety floor too far, and could cause excessive small requests. Those findings are being addressed. The review also missed a required heading that is present in the prior session entry; this is recorded as a false positive.

## Work Completed

- Restored the public `AI_REVIEW_MAX_DIFF_CHARS` minimum to 2,000 and the continuation source-content floor to 1,000 characters. The retry helper now uses a separate internal partitioner, so adaptive retries can go below the configured pass size without weakening those safeguards. See [AI review core](../../scripts/ai-code-review-core.mjs).
- Set the retry floor to 1,200 characters. Existing `AI_REVIEW_MAX_CHUNKS` continues to cap all initial and retry passes.
- Updated [GitHub setup guidance](../github-setup.md) and the regression test in [AI review core tests](../../tests/unit/scripts/ai-code-review-core.test.mjs).
- The prior note's “Recommended Next Step” heading is present as required by [session history instructions](README.md). The automated finding that it was absent is not actionable.

## Decisions

- Keep the original configured diff and source-content floors; allow only bounded retry partitions below the configured per-pass size.
- Review code runs from the trusted default branch and treats the PR diff as untrusted data. An incomplete AI review provides no findings; use a human review of the complete change, focused on safety-sensitive paths, together with `npm run check` before merging.

## Verification

- `npx vitest run tests/unit/scripts/ai-code-review-core.test.mjs` — passed (13 tests).
- `npm run check` — passed (23 test files passed, 1 skipped; 243 tests passed, 1 todo).
- `git diff --check` — passed.
- PR #8's first AI review completed across five passes. It reported three actionable implementation/documentation concerns and one non-actionable missing-heading claim. The three actionable concerns have been addressed in this follow-up.

## Unresolved

- The correction to the prior session note is append-only; the earlier note remains as a historical record of the initial implementation and is superseded by this follow-up.
- PR #8 needs a rerun of CI and AI review on the revised commit before merge.

## Recommended Next Step

Push the revised commit, review the new AI output and complete-diff safety boundaries, then merge if all findings are resolved and checks pass.
