# Session: Contextual replies to planning choices

- Date: 2026-10-23
- Time: 14:52 America/New_York
- Status: Partial
- Scope: Prevent a reply to a monthly-versus-annual planning choice from entering goal-allocation clarification.

## Outcome

The agent now rejects unsupported goal-allocation classifications in this follow-up case and allows the conversational personalizer to use recent dialogue when responding to a financial follow-up, even while an unrelated savings suggestion remains pending. The personalizer is instructed to resolve the user's answer in context, preserve whether an amount was a projection, and avoid treating a period choice as a new savings goal. A fixed personalized fallback line was removed so normal personalized wording remains provider-generated.

## Work Completed

- Added a narrow intent safeguard, contextual-question routing, and pending-suggestion continuation handling in [Victoria's agent](../../src/agent/victoria-agent.ts).
- Passed recent conversation to [the personalized reply provider](../../src/agent/memory/openai-personalized-reply.ts) and its [validation contract](../../src/agent/memory/personalized-reply.ts).
- Removed the fixed contextual fallback from [the companion response policy](../../src/agent/team-response-policy.ts); the standard safety fallback remains for provider or validation failures.
- Added the expected follow-up behavior to [the test plan](../../tests/test-plan.md).

## Decisions

- A choice of monthly or annual planning horizon does not authorize goal allocation or ledger recording.
- When the user's follow-up answers a recent Victoria question, the conversational model receives the exchange so it can respond to the answer rather than restart the topic.

## Verification

- No tests or checks were run.
- The working tree contains extensive pre-existing modifications; this session changed only the files listed above plus this history entry.

## Unresolved

- The reported CLI sequence has not been rerun against this change.
- Provider classification and follow-up wording remain to be verified with the configured local CLI.

## Recommended Next Step

Replay the three-turn gym conversation locally and confirm that “I want the annual” is handled as an answer about the projection, with no goal-allocation prompt and no ledger mutation.
