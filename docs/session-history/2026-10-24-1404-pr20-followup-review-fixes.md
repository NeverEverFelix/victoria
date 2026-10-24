# Session: Address follow-up PR 20 safety review

- Date: 2026-10-24
- Time: 14:04 EDT
- Status: Completed
- Scope: Apply new actionable findings from the AI review of commit `86a4964`.

## Outcome

Explicit real-transfer commands take precedence over employer-covered expense planning. Covered-expense and Companion Voice amounts now use strict positive USD cents checks. Planning state is based on deterministic context, with a safe target-choice fallback when generated wording is incomplete.

## Work Completed

- Added a direct transfer-intent guard and reused strict dollar parsing in [money-movement-intent.ts](../../src/agent/money-movement-intent.ts), then enforced the guard in [mock-llm.ts](../../src/agent/llm/mock-llm.ts) and [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Made restored planning and first-turn target choice independent of a regex over generated response wording in [victoria-agent.ts](../../src/agent/victoria-agent.ts) and [team-response-policy.ts](../../src/agent/team-response-policy.ts).
- Rejected negative, malformed, and over-precise Companion Voice amounts; filtered malformed runtime memory values before personalized reply amount matching; expanded an explicit ledger refusal amount pattern in [policy.ts](../../src/agent/policy.ts).
- Added regressions in [money-movement-intent.test.ts](../../tests/unit/agent/money-movement-intent.test.ts), [team-response-policy.test.ts](../../tests/unit/agent/team-response-policy.test.ts), [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts), and [policy.test.ts](../../tests/unit/agent/policy.test.ts). Updated the [test plan](../../tests/test-plan.md).

## Decisions

- The earlier confirmed provider defaults and eight-fact extraction ceiling still stand in [decisions.md](../decisions.md). The automated review continued to compare them with superseded default-off and three-fact guidance.
- A sentence that asks for budgeting advice about where freed money could go remains a planning conversation; a direct command to Victoria to transfer it is refused.

## Verification

- `npm run check` passed: 67 test files and 608 tests passed, 15 skipped, 9 todo.
- One pre-existing unused-variable lint warning and SQLite experimental warnings remained.

## Unresolved

- Hosted staging behavior was not exercised in this local repair slice.
- First-turn wording quality still needs a varied-input evaluation.

## Recommended Next Step

Push the follow-up commit, inspect CI and the updated AI review, and triage any genuinely new findings against the current product decisions.
