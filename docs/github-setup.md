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

Optional repository variable if AI review should fail rather than skip when its secret is unavailable:

```text
AI_REVIEW_REQUIRED=true
```

If `OPENAI_API_KEY` is not set, the AI review workflow skips cleanly by default. If `AI_REVIEW_REQUIRED=true`, a missing key fails the workflow.

For pull requests, the workflow uses `pull_request_target`, explicitly checks out the default branch, and downloads the proposed patch through the GitHub API. It must never check out or execute the pull request head while `OPENAI_API_KEY` or a write-capable token is available. The diff is untrusted review input, not executable code. If GitHub requires an Actions event policy for `pull_request_target`, allow this workflow only after confirming those constraints remain intact.

The AI prompt keeps trusted instructions separate from the untrusted diff. If a diff exceeds `AI_REVIEW_MAX_DIFF_CHARS`, the review lists all changed paths, prioritizes safety-sensitive excerpts, and posts a prominent incomplete-review warning. With `AI_REVIEW_REQUIRED=true`, an oversized or empty diff fails rather than satisfying the review job.

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
