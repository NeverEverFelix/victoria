# Session: Weekly Progress Read-Only Tool

- Date: 2026-10-03
- Time: 18:47 EDT
- Status: Completed
- Scope: Add an agent-to-tool path for answering weekly savings progress questions from the mocked ledger.

## Outcome

Victoria now recognizes a weekly savings progress question, calls a user-scoped read-only summary tool, and reports completed entries in the current week with explicit mocked-ledger wording.

## Work Completed

- Added `savings_progress` classification and a `summarize_progress` agent action.
- Added `getWeeklySavingsTotal` to the tool contract and mock tools.
- Added a domain total that counts completed entries between Monday 00:00 UTC and the next Monday, excluding prior weeks, pending entries, and canceled entries.
- Added agent and domain tests for totals, user scoping, the read-only tool call, and empty-week messaging.
- Updated [agent-work-queue.md](../agent-work-queue.md) and [test-plan.md](../../tests/test-plan.md) with the behavior and UTC-week assumption.

## Decisions

- Confirmed behavior: weekly progress is read-only, user-scoped, and reports the total as recorded in the mocked Victoria savings ledger.
- MVP assumption: the week begins Monday at 00:00 UTC until user-local timezone support exists. The user stories specify the current week but do not define its timezone.

## Verification

- `npm test -- --run tests/unit/domain/savings.test.ts tests/unit/agent/victoria-agent.test.ts` passed: 20 tests passed.
- `npm run check` passed: setup validation, type checks, and 99 tests passed; 25 tests remain todo and 1 test file is skipped.
- Lint reports three existing warnings in `src/agent/memory/mock-memory.ts` and `tests/unit/agent/policy.test.ts`.
- `git diff --check` passed.

## Unresolved

- Weekly boundaries use UTC because user timezone preferences are not available.
- Ledger and conversation state remain in-memory mocks without durable persistence.

## Recommended Next Step

- Continue with the next queued headless behavior, goal allocation, after reviewing its existing tests and safety boundaries.
