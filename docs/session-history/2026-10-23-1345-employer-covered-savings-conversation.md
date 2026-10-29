# Session: Employer-Covered Expense Conversation

- Date: 2026-10-23
- Time: 13:45 America/New_York
- Status: Completed
- Scope: Improve Victoria's response to a recurring expense newly covered by an employer, while keeping savings recording approval-gated.

## Outcome

Victoria recognizes a clearly stated monthly expense now covered by an employer as a budgeting and savings moment. The response distinguishes the user-stated monthly amount from an annualized projection, proposes recording only the monthly amount, and does not claim access to the user's complete financial picture.

## Work Completed

- Added a narrow employer-covered recurring-expense recognizer in [money-movement-intent.ts](../../src/agent/money-movement-intent.ts), used by mock classification and the deterministic safety boundary so this advice question is not treated as a real transfer request.
- Added an annualized projection and a specific-destination limitation to the suggestion response in [victoria-agent.ts](../../src/agent/victoria-agent.ts). The projection is never used as the proposed ledger amount.
- Added the behavior to [Story 22](../user-stories.md), [mvp.md](../mvp.md), and [test-plan.md](../../tests/test-plan.md), with regression coverage in [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts).

## Decisions

- Confirmed for this behavior: employer-covered recurring costs can be discussed as freed-up spending; annualized values are projections; only the user-provided current-period amount is proposed for the mocked ledger; explicit confirmation remains required.
- No destination is inferred from “move this money elsewhere.” A destination can be discussed if the user names a goal or provides enough financial context.

## Verification

- `npm run check` — passed: agent setup validation, lint, type checks, and 65 test files passed; 7 skipped; 558 tests passed, 15 skipped, 9 todo.
- `npx vitest run tests/unit/agent/victoria-agent.test.ts` — passed: 80 tests.
- `git diff --check` — passed.
- Existing lint warning in `tests/unit/agent/memory-orchestrator.test.ts:112` and Node SQLite experimental warnings remain.

## Unresolved

- Recognition is intentionally narrow: one explicit USD amount and a clear monthly or yearly cadence, with employer coverage stated. Other benefit structures need separate evidence and tests.
- Existing unrelated working-tree changes were present before this work and were left intact.

## Recommended Next Step

- Exercise the new turn in the provider-backed local CLI, then test an explicit transfer instruction and a user follow-up before deciding whether broader budgeting advice belongs in the next slice.
