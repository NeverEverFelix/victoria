# Session: Add a typed planning-reference handoff

- Date: 2026-10-25
- Time: 18:26 EDT (America/New_York)
- Status: Completed
- Scope: Bind period references to the active pending savings proposal's scoped planning choice without changing the proposal or approval boundary.

## Outcome

Victoria now resolves period selections and period-specific record requests through a typed, deterministic planning-reference contract. “Actually, use monthly” can revise an annual planning horizon in the same pending workflow. In both cases, the exact pending ledger proposal remains unchanged and a separate explicit confirmation is still required.

## Work Completed

- Added [planning-reference-resolver.ts](../../src/agent/planning-reference-resolver.ts), which resolves only against the active proposal's validated monthly amount and annual projection. It rejects conflicting periods, mismatched or multiple explicit amounts, and invalid projection context.
- Routed the pending savings path in [VictoriaAgent](../../src/agent/victoria-agent.ts) through the typed result; the resolver has no proposal, approval, or ledger authority.
- Added [resolver unit tests](../../tests/unit/agent/planning-reference-resolver.test.ts) and extended [VictoriaAgent tests](../../tests/unit/agent/victoria-agent.test.ts) for the annual-to-monthly planning change and no-write behavior.
- Updated [Story 22](../user-stories.md), the [test plan](../../tests/test-plan.md), the [agent module guide](../../src/agent/README.md), and the [agent work queue](../agent-work-queue.md).

## Decisions

- Confirmed: the active proposal's persisted planning choice is the source for period references in this flow; the resolver cannot invent amounts.
- Confirmed: changing a planning horizon does not revise the current-period ledger proposal and does not count as approval.
- Not implemented: a general conversation state manager or generalized specialist context handoff.

## Verification

- Focused resolver and agent suites passed: 2 files, 121 tests.
- `npm run check` passed: 71 test files passed, 8 skipped; 655 tests passed, 19 skipped, 9 todo.
- `git diff --check` passed.
- The existing ESLint warning in `memory-orchestrator.test.ts` and Node SQLite experimental warnings remain.

## Unresolved

- The broader architecture still lacks a general typed conversation workflow state contract and consistent curated conversation context for Savings Reasoning.
- Other period/reference-based proposal revisions need their own domain semantics and must not be inferred from this planning-only resolver.

## Recommended Next Step

- Add a bounded `ResolvedFinancialContext` handoff to Savings Reasoning for grounded source facts and deterministic projections, then verify the specialist can reason over them without calculating, revising, or approving financial actions.
