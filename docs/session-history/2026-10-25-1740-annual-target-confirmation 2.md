# Session: Clarify annual target confirmation

- Date: 2026-10-25
- Time: 17:40 EDT (America/New_York)
- Status: Completed
- Scope: Simplify the employer-covered expense follow-up after a user chooses the annual planning target.

## Outcome

Victoria now acknowledges the annual target directly and states exactly what a “yes” will do: record only the current month's user-stated amount in the mocked ledger. Repeated annual choices and a “future target” clarification keep the pending proposal alive instead of triggering an already-saved question or a goal-allocation detour.

## Work Completed

- Updated the [agent response path](../../src/agent/victoria-agent.ts) to affirm the annual target, explain the monthly basis, and ask for one exact approval of this month's mocked entry.
- Kept repeated annual choices and future-target clarifications within the same approval flow. No response treats the annual projection as currently saved.
- Updated regression coverage in [VictoriaAgent tests](../../tests/unit/agent/victoria-agent.test.ts), plus Story 22, MVP guidance, safety-contract example, and test plan.

## Decisions

- Confirmed: the projected annual amount is a planning target, not a recordable current saving. A “yes” after the explicit offer applies only to this month's stated monthly amount.
- Confirmed: Victoria's MVP can record a mocked ledger entry but cannot move real money.

## Verification

- Targeted `VictoriaAgent` suite passed: 115 tests.
- `npm run check` passed: 70 test files passed, 8 skipped; 649 tests passed, 19 skipped, 9 todo. The existing lint warning and SQLite experimental warnings remain.
- No live provider replay was run for this wording change.

## Unresolved

- A separate durable planning-target record does not exist; this annual preference remains scoped to the conversation.
- Long-session dialogue state, structured tracing, and asynchronous memory processing remain open. Context-builder work stays paused.

## Recommended Next Step

- Review whether Victoria should persist annual savings targets as a distinct planning record, separate from saved ledger entries, before implementing that capability.
