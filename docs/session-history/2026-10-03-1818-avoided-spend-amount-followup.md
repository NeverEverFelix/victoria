# Session: Ask For An Unknown Avoided Spend Amount

- Date: 2026-10-03
- Time: 18:18 EDT
- Status: Completed
- Scope: Complete the avoided-spend flow when no amount or known merchant estimate is available.

## Outcome

Victoria now recognizes a clear avoided-spend event with an unknown amount, asks for the amount, and uses the user's answer to create a pending suggestion that still requires approval.

## Work Completed

- Updated [mock-llm.ts](../../src/agent/llm/mock-llm.ts) so a clear "instead of" or "almost bought" description can be recognized as avoided spend even without a known merchant or amount.
- Updated [victoria-agent.ts](../../src/agent/victoria-agent.ts) to keep the clarification context and event in memory for the conversation, then reuse the event when the user supplies an amount.
- Added a two-turn scenario in [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts) that verifies no proposal or ledger entry exists before the user provides an amount and approval remains required afterward.
- Updated [test-plan.md](../../tests/test-plan.md) with the missing-amount continuation expectation.

## Decisions

- The savings event is created when the avoided-spend moment is understood, even if the amount is still unknown.
- Proposal lifecycle and clarification context remain in-memory agent state. A durable proposal store is deferred until persistence work.
- A user-provided amount is attached to the resulting suggestion; the earlier event is reused without being rewritten.

## Verification

- The new scenario failed before implementation at the amount follow-up assertion, confirming the missing behavior.
- `npm run check` passed: agent setup validation, type checks, and 95 tests passed; 25 tests remain todo and 1 test file is skipped.
- Lint reported three existing unused-variable warnings in `src/agent/memory/mock-memory.ts` and `tests/unit/agent/policy.test.ts`.

## Unresolved

- Clarification context and financial events are not persisted across agent restarts.
- Existing unrelated worktree changes remain, including README, architecture, and earlier session-history files.

## Recommended Next Step

Move to regretful-spend reflection, confirming that regret is handled without proposing savings or creating ledger entries.
