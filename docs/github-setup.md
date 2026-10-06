# GitHub Setup

This document captures repository settings that cannot be fully enforced from files alone.

## Required Secrets

To enable AI code review, add this repository secret:

```text
OPENAI_API_KEY
```

Optional repository variable:

```text
OPENAI_CODE_REVIEW_MODEL
```

Optional repository variable for the response budget of each review pass (default `4000`; allowed range `100`–`4000`):

```text
AI_REVIEW_MAX_OUTPUT_TOKENS
```

Optional repository variable for the maximum diff characters sent in one pass (default `12000`; minimum `500`):

```text
AI_REVIEW_MAX_DIFF_CHARS
```

Optional repository variable for the maximum total API calls, including adaptive retries (default `96`; must be a positive integer):

```text
AI_REVIEW_MAX_CHUNKS
```

Optional repository variable if AI review should fail rather than skip when its secret is unavailable:

```text
AI_REVIEW_REQUIRED=true
```

If `OPENAI_API_KEY` is not set, the AI review workflow skips cleanly by default. If `AI_REVIEW_REQUIRED=true`, a missing key fails the workflow.

For pull requests, the workflow uses `pull_request_target`, checks out the exact base commit, and downloads the proposed patch through the GitHub API. It runs when a PR is opened, reopened, synchronized, marked ready, or edited. Push events on all branches run the review for each pushed commit. The review loads trusted rules from the PR base commit or pushed commit and treats the PR diff only as untrusted evidence. The workflow must never check out or execute the pull request head while `OPENAI_API_KEY` or a write-capable token is available.

The AI prompt keeps trusted instructions separate from the untrusted diff. The diff is split into passes of at most 12,000 characters by default, with up to five passes reviewed concurrently to reduce latency. If a pass exceeds its 4,000-token output budget, only that pass is divided and retried down to 500 characters. `AI_REVIEW_MAX_CHUNKS` (default 96) bounds total API calls, including retries; remove repository overrides that set it lower than the default unless the tighter cap is intentional. `AI_REVIEW_MAX_COMMENT_CHARS` (default 60,000) protects GitHub's comment-size limit. If the call budget is exhausted or the smallest pass is still truncated, the workflow fails without posting a partial review. Each trusted context file is visibly marked if truncated.

## Recommended Branch Protection

Configure this in GitHub:

```text
Settings -> Branches -> Branch protection rules -> Add rule
```

Recommended rule for `main`:

- Require a pull request before merging.
- Require review from Code Owners.
- Require status checks to pass before merging.
- Require branches to be up to date before merging.
- Required status check: `Check`.
- Require conversation resolution before merging.
- Do not allow force pushes.
- Do not allow deletions.

Recommended early-stage choice:

Require `Check`. Treat `Review PR` as an advisory comment workflow, not a required status: `pull_request_target` runs in the base-branch context rather than the pull request head context. A future required AI gate needs a separate trusted service or a carefully designed two-workflow architecture.

## Pull Request Flow

1. Create a branch for one implementation slice.
2. Use `.agents/tasks/` or `docs/agent-work-queue.md` to define scope.
3. Open a PR using `.github/pull_request_template.md`.
4. Confirm CI passes.
5. Read the AI review comment if configured.
6. Resolve review findings.
7. Merge only when the PR matches Victoria's safety boundaries.
8. Review the post-merge AI job summary and immediately follow up on any regression it finds.

## Labels

Useful labels:

- `implementation`
- `product`
- `decision`
- `safety`
- `documentation`
- `agentic-coding`
- `tests`

These labels can be created in GitHub as needed.
