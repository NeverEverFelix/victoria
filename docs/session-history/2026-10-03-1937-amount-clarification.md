# Session: Amount Clarification

- Date: 2026-10-03
- Time: 19:37 EDT
- Status: Completed
- Scope: Reject recognized non-USD currencies and over-precise explicit USD amounts before proposing mocked savings.

## Outcome

Victoria now asks for a valid USD amount when an avoided-spend message uses a recognized non-USD currency or more than two decimal places. Neither case creates a proposal or ledger entry. An invalid correction to a pending amount also blocks approval until a valid correction is supplied or the user declines.

## Work Completed

- Added parse statuses for absent amounts, valid USD cents, excess precision, and recognized unsupported currencies in [parse-explicit-amount.ts](../../src/domain/financial-events/parse-explicit-amount.ts).
- Routed parse issues into targeted clarification in [mock-llm.ts](../../src/agent/llm/mock-llm.ts) and [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added parser and agent coverage for `$6.755`, `€20`, and invalid pending corrections.
- Updated Story 1, the MVP safety contract, and the test plan.

## Decisions

- Confirmed MVP behavior: do not round user-entered values with more than two fractional digits; do not convert recognized non-USD currencies; ask for an explicit USD value instead.
- Zero, negative, and multiple plausible amount handling remains out of scope for this slice.

## Verification

- Focused parser, agent, and contract tests passed (52 tests).
- `npm run check` passed: 115 tests passed, 22 TODO, 1 skipped; agent validation and both typechecks passed.
- Three existing lint warnings remain in mock memory and policy tests.
- `git diff --check` passed.

## Unresolved

- The broader AMT-002 scenario still needs zero, negative, and multiple-amount cases.
- Recognized currency symbols and names are intentionally limited; this is not a comprehensive locale-aware currency parser.
- Several earlier slices remain uncommitted in the shared worktree and were preserved.

## Recommended Next Step

- Implement the next narrow AMT-002 behavior for zero and negative explicit amounts, ensuring no savings proposal or ledger write can result.
