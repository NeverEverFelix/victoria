# Session: Retry rejected companion drafts

- Date: 2026-10-23
- Time: 15:02 America/New_York
- Status: Partial
- Scope: Prevent safety validation from flattening the first covered-expense reply into a generic ledger prompt when the generated response omits required context.

## Outcome

When Companion Voice output fails safety or grounding validation, Victoria now asks the provider for one revised, dynamically generated reply with feedback about the missing context. The existing guarded response remains the fallback if the revision also fails. The employer-covered monthly expense context and the annual projection remain supplied by validated parsing and arithmetic.

## Work Completed

- Expanded Companion Voice guidance to use the Victoria system prompt, preserve the human context of a covered recurring expense, and honor revision feedback in [OpenAI team specialists](../../src/agent/team/openai-specialists.ts).
- Added one bounded revision attempt after a rejected voice draft in [Victoria's agent](../../src/agent/victoria-agent.ts).

## Decisions

- Response wording remains model-generated; no scenario-specific sentence was added as a scripted response.
- A projection remains a planning figure conditional on continuing coverage. Only an explicitly confirmed monthly amount can be recorded in the mocked ledger; real transfers and linked-account actions remain outside the MVP.

## Verification

- `git diff --check` passed.
- No tests or CLI replay were run; the user supplied a live regression transcript but did not request a verification run.

## Unresolved

- The revised provider path has not yet been exercised in the local CLI, so whether it fixes the reported live response remains unconfirmed.
- The worktree contains extensive unrelated and earlier in-progress changes; they were preserved.

## Recommended Next Step

Replay the original employer-covered basketball expense message in the local CLI and inspect whether the provider draft passed on its first or revision attempt, while confirming no mocked ledger entry is created before approval.
