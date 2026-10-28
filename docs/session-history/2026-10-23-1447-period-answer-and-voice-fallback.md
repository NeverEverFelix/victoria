# Session: Period answers and voice fallback routing

- Date: 2026-10-23
- Time: 14:47 America/New_York
- Status: Partial
- Scope: Keep annual-projection follow-ups conversational and ensure supported covered-expense turns reach the voice specialist.

## Outcome

Period references during a covered monthly expense are routed away from proposal-revision and goal-allocation handling when they do not specify a new ledger amount or explicit allocation action. The personalized reply provider receives the recent exchange and the validated annual projection. A deterministic employer-covered-expense classification can proceed to the reasoning and voice specialists if the provider classifier fails validation.

## Work Completed

- Updated [Victoria's agent](../../src/agent/victoria-agent.ts) to resolve period-choice follow-ups and to avoid skipping the voice team after a provider classification failure on a supported employer-covered monthly expense.
- Passed the derived annual projection to [the personalized reply provider](../../src/agent/memory/openai-personalized-reply.ts) and enabled amount validation in [the reply policy](../../src/agent/memory/personalized-reply.ts).
- Added regression expectations to [the test plan](../../tests/test-plan.md).

## Decisions

- Choosing an annual planning horizon is not approval to record the annualized amount and is not a proposal revision unless the user specifies a supported amount or explicit action.
- A deterministic, evidence-grounded classification may keep the agentic reasoning and voice stages available when the upstream classifier fails; it does not grant ledger approval.

## Verification

- `git diff --check` passed for the changed files.
- No tests or CLI replay were run.
- The worktree contains many pre-existing modifications.

## Unresolved

- The CLI sequence has not yet been replayed against this fix.
- Provider classification and voice behavior still need runtime verification.

## Recommended Next Step

Replay the covered-gym flow, then reply that the annual amount is preferred. Confirm the response acknowledges the projection, preserves the pending $35 monthly approval boundary, and does not request a savings goal.
