# Session: Align Memory Provider Defaults In Documentation

- Date: 2026-10-22
- Time: 20:06 America/New_York
- Status: Completed
- Scope: Reconcile memory extraction and episodic summary documentation with current runtime configuration.

## Outcome

Current product and environment documentation now agrees that structured provider extraction runs by default only when a real provider model and key are configured, and can be disabled with `OPENAI_MEMORY_EXTRACTION_ENABLED=false`. Episodic summaries remain separately opt-in with `OPENAI_EPISODIC_SUMMARIES_ENABLED=true`. The default example environment uses a mock model and placeholder key, so it makes no extraction calls.

## Work Completed

- Confirmed the learning-schema policy already describes the current extraction and summary defaults.
- Updated the stale local persistent-memory description in [MVP](../mvp.md) to reflect optional local OpenAI embeddings and the no-key recent-memory fallback.
- Clarified the default-local-runtime statement in [test plan](../../tests/test-plan.md) and retained the provider gate details in [environment docs](../environments.md).
- Historical session notes were left unchanged because they accurately record the defaults and implementation state at those earlier dates.

## Decisions

- No runtime behavior changed. Provider extraction is conditionally enabled by a real model/key unless disabled; episode summarization remains explicit opt-in.
- Environment examples may keep `OPENAI_MEMORY_EXTRACTION_ENABLED=true`; their mock model and placeholder key prevent provider calls.

## Verification

- `npm run agent:validate` passed.
- `git diff --check` passed.
- Searched current docs, tests, and environment examples for stale statements that provider extraction or both memory adapters are disabled by default. Remaining matches are dated historical session records or accurately describe episodic summaries.
- Full code checks were not run because this was a documentation-only reconciliation.

## Unresolved

- The repository still has substantial pre-existing uncommitted work; it was preserved.

## Recommended Next Step

No further documentation change is needed for this default-setting discrepancy. Update these statements if runtime gates change.
