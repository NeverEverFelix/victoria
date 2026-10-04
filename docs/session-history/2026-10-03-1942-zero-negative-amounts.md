# Session: Zero And Negative Savings Amounts

- Date: 2026-10-03
- Time: 19:42 EDT
- Status: Completed
- Scope: Reject explicit zero and negative USD amounts before creating or revising mocked savings proposals.

## Outcome

Victoria now asks for a positive USD amount when an avoided-spend message or pending proposal revision contains zero or a negative value. These inputs cannot become proposals or ledger entries.

## Work Completed

- Extended [parse-explicit-amount.ts](../../src/domain/financial-events/parse-explicit-amount.ts) to identify `$0`, `$0.00`, `-$5`, and `$-5` as invalid savings values.
- Routed invalid values through clarification in [mock-llm.ts](../../src/agent/llm/mock-llm.ts) and [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added parser and agent tests, updated AMT-002 traceability in the [safety contract](../specification/mvp-safety-contract.md), and added the behavior to the [test plan](../../tests/test-plan.md).

## Decisions

- Confirmed contract: savings proposals require a positive amount; zero and negative explicit USD values require clarification.
- Multiple plausible amounts remain unresolved under AMT-002.

## Verification

- Focused domain and agent tests passed: 34 tests.
- `npm run check` passed: 117 tests passed, 22 todo, 1 skipped; setup validation and both typechecks passed.
- Lint reports three existing warnings in mock memory and policy tests.
- `git diff --check` passed.

## Unresolved

- AMT-002 still needs coverage for multiple plausible amounts and broader currency/amount syntax.
- Existing work from prior slices remains uncommitted in the shared worktree and was preserved.

## Recommended Next Step

- Implement AMT-002 clarification for messages containing multiple plausible dollar amounts, ensuring no proposal or ledger entry is created until the user identifies one amount.
