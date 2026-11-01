# Session: Correct review-found memory and intent edges

- Date: 2026-10-24
- Time: 14:11 EDT
- Status: Completed
- Scope: Triage the AI review of commit `99af151` and fix reproducible covered-expense memory, transfer-intent, and ledger wording defects.

## Outcome

Victoria keeps the original budgeting question as planning advice, refuses clear transfer requests within covered-expense turns, and avoids treating generic “move” requests as transfers. An unrelated reply preference is saved without absorbing the following covered-expense sentence. Ledger wording retains a stated goal and uses a named annual projection.

## Work Completed

- Narrowed direct financial commands, identified budgeting advice questions, and preserved transfer priority in [money-movement-intent.ts](../../src/agent/money-movement-intent.ts), [mock-llm.ts](../../src/agent/llm/mock-llm.ts), and [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Corrected the missing-interest check in [victoria-agent.ts](../../src/agent/victoria-agent.ts). Scoped generic preference, habit, and goal evidence to the first sentence in [extract-preference.ts](../../src/agent/memory/extract-preference.ts).
- Added a named annual projection to [team-prototype.ts](../../src/agent/team-prototype.ts), validated its twelve-month relationship for fallback wording, and preserved goal names during ledger-confirmation normalization in [team-response-policy.ts](../../src/agent/team-response-policy.ts).
- Added regressions in [money-movement-intent.test.ts](../../tests/unit/agent/money-movement-intent.test.ts), [preference-memory.test.ts](../../tests/unit/agent/preference-memory.test.ts), [team-response-policy.test.ts](../../tests/unit/agent/team-response-policy.test.ts), and [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts). Updated the [test plan](../../tests/test-plan.md).

## Decisions

- Direct commands to move funds take precedence over covered-expense planning. A request for advice about redirecting freed money remains a planning question; no real transfer is offered.
- The provider defaults and eight-fact extraction ceiling in [decisions.md](../decisions.md) remain confirmed. Automated findings relying on earlier defaults were not applied.

## Verification

- `npm run check` passed: 67 test files and 616 tests passed, 15 skipped, 9 todo.
- One existing unused-variable lint warning in `memory-orchestrator.test.ts` and SQLite experimental warnings remained.

## Unresolved

- Hosted staging was not replayed for this local review repair.
- First-turn voice quality still needs a varied-input evaluation.

## Recommended Next Step

Push this repair, verify CI, and proceed to a separate evaluation of first-turn conversational quality.
