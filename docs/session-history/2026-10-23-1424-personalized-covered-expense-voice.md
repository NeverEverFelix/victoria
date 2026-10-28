# Session: Personalized employer-covered expense responses

- Date: 2026-10-23
- Time: 14:24 America/New_York
- Status: Partial
- Scope: Improve Victoria's response to a user whose employer now covers a recurring monthly expense.

## Outcome

The provider voice instructions now require an emotionally aware response to the user's actual budgeting question, acknowledge a supplied remembered interest, distinguish monthly cash flow from the conditional annual projection, and request approval only for recording the current monthly amount. The response guard rejects drafts that omit provided interest or a validated additional projection, and its fallback uses available context.

## Work Completed

- Updated [the system prompt](../../src/agent/prompts/system-prompt.ts), [companion voice instructions](../../src/agent/team/openai-specialists.ts), and [response policy](../../src/agent/team-response-policy.ts).
- Simplified construction of the validated response context in [Victoria's agent](../../src/agent/victoria-agent.ts).
- Clarified the expected experience in [the MVP behavior](../mvp.md) and [the test plan](../../tests/test-plan.md).

## Decisions

- The annualized amount is a conditional planning projection, not a current savings amount eligible for ledger recording.
- A remembered interest should surface naturally when relevant; the assistant must not use a fixed hardcoded conversational line as its normal response.
- Only the current monthly amount may be proposed for the mocked ledger, and recording still requires explicit confirmation.

## Verification

- No tests or checks were run in this session.
- The working tree contains extensive pre-existing modifications; changes were limited to the files listed above.

## Unresolved

- The live CLI response was not rerun after these changes, so provider behavior is not confirmed.
- The strengthened voice requirements and contextual fallback need a focused regression check before treating the experience as verified.

## Recommended Next Step

Run the employer-covered recurring-expense conversation in the configured local CLI and inspect whether the model's draft passes the guard with the basketball memory and $420 projection in its response.
