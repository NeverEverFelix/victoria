# Session: Recognize ended recurring activity costs

- Date: 2026-10-24
- Time: 14:21 EDT
- Status: Completed
- Scope: Fix a local chat response that asked for an activity and amount already stated when the user had quit a recurring paid activity.

## Outcome

Victoria can use a clearly ended activity's stated recurring cost for a conditional savings planning conversation even when the provider classifies the turn as unclear. Choosing a monthly or annual planning target does not record savings; a separate confirmation can record only the current monthly amount.

## Work Completed

- Added conservative ended-cost parsing and reused the existing planning and approval path in [the agent](../../src/agent/victoria-agent.ts) and [money intent rules](../../src/agent/money-movement-intent.ts).
- Updated [voice guidance](../../src/agent/team/openai-specialists.ts) and [safe fallback wording](../../src/agent/team-response-policy.ts) so annual projections depend on the monthly cost staying out of the budget rather than employer coverage.
- Added a provider-unclear regression, tentative-cancellation guard, real-transfer refusal, and separate approval check in [agent tests](../../tests/unit/agent/victoria-agent.test.ts).
- Documented the behavior in [MVP scope](../mvp.md), [Story 23](../user-stories.md), [the safety contract](../specification/mvp-safety-contract.md), and [the test plan](../../tests/test-plan.md).

## Decisions

- Confirmed implementation of Story 23: a stopped personal recurring cost is conditional planning context, and only one current-month mocked entry may be offered after a separate approval. No new real-money capability was added.

## Verification

- `npm run check` passed: 67 test files passed, 620 tests passed, 15 skipped, 9 todo. Lint reported one existing unused-variable warning; SQLite emitted experimental-feature warnings.
- `git diff --check` passed.
- No live OpenAI replay was run; the regression injects an unclear provider finding without spending API credits.

## Unresolved

- Provider-generated wording remains variable; the deterministic fallback and test cover the amount, projection, and approval boundaries.

## Recommended Next Step

- Replay the original terminal conversation in a fresh local chat to assess the live tone and practical advice, then adjust voice wording if needed without changing the ledger boundary.
