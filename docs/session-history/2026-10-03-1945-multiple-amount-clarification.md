# Session: Multiple Amount Clarification

- Date: 2026-10-03
- Time: 19:45 EDT
- Status: Completed
- Scope: Complete the multiple-plausible-amount portion of AMT-002 for avoided-spend messages and pending proposal revisions.

## Outcome

Victoria asks the user to choose when a message includes multiple explicit dollar amounts. It does not create a proposal or ledger entry from the ambiguous amount, and it prevents a pending suggestion from being approved until the revision is clarified.

## Work Completed

- Updated [parse-explicit-amount.ts](../../src/domain/financial-events/parse-explicit-amount.ts) to detect multiple explicit USD amounts.
- Added targeted clarification to the classifier and agent, including the pending-proposal revision path in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added parser, agent, and traceability coverage in [financial-events.test.ts](../../tests/unit/domain/financial-events.test.ts), [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts), and [mvp-safety-contract.pending.test.ts](../../tests/contracts/mvp-safety-contract.pending.test.ts).
- Updated the AMT-002 status in the [safety contract](../specification/mvp-safety-contract.md) and the [test plan](../../tests/test-plan.md).

## Decisions

- Confirmed contract: multiple explicit dollar amounts require clarification before proposing or revising a savings amount.
- AMT-002 amount validation is covered for zero, negative, and multiple dollar amounts. Excess precision and recognized unsupported currencies remain covered by AMT-004 and AMT-005.

## Verification

- Focused parser, agent, and traceability tests passed: 38 tests.
- `npm run check` passed: 120 tests passed, 21 todo, 1 skipped; setup validation and both typechecks passed.
- Lint reports three existing warnings in mock memory and policy tests.
- `git diff --check` passed.

## Unresolved

- The explicit amount parser supports a narrow set of dollar forms and recognized non-USD currencies; it is not a general locale-aware money parser.
- Earlier slices remain uncommitted in the shared worktree and were preserved.

## Recommended Next Step

- Review remaining non-UI contract TODOs and choose the next smallest behavior that advances a queued MVP slice. Keep UI work deferred until the headless queue is complete and verified.
