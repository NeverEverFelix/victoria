# Session: APR-005 Proposal Revisions

- Date: 2026-10-03
- Time: 19:27 EDT
- Status: Completed
- Scope: Complete APR-005 behavior for revisions to a pending savings proposal.

## Outcome

Pending proposal amount, reason, and goal changes now replace the proposal and require fresh approval. Unsupported currency changes leave the USD mocked-ledger proposal unchanged.

## Work Completed

- Added linked replacement proposals and fresh action IDs for amount and reason edits in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Pending goal changes now also create a new linked proposal and keep the tool payload aligned with its identity.
- Added deterministic mock classification for proposal edits in [mock-llm.ts](../../src/agent/llm/mock-llm.ts).
- Added coverage for amount, reason, goal, unsupported currency, stale approval, and cross-user approval in [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts).
- Updated APR-005 contract status, work queue, and test plan.

## Decisions

- Confirmed for the MVP: amount, reason, and goal are editable while a proposal is pending, and each edit requires a linked replacement proposal and fresh approval.
- Currency remains USD, movement remains `mock_ledger`, and proposal ownership remains bound to the authenticated user. These are fixed boundaries, not editable proposal fields.

## Verification

- `npx vitest run tests/unit/agent/victoria-agent.test.ts tests/unit/agent/policy.test.ts tests/contracts/mvp-safety-contract-traceability.test.ts` passed (35 tests).
- `npm run check` passed: 110 tests passed, 24 TODO, 1 skipped; agent validation, lint, and typechecks passed.
- Three existing lint warnings remain in mock memory and policy test files.
- `git diff --check` passed.

## Unresolved

- The mock classifier supports a narrow set of natural-language revision forms; a production model adapter and broader parser coverage are not part of this slice.
- The repository still has 24 safety-contract TODO scenarios and the other MVP work queue items. Changes from several prior slices remain uncommitted in the shared worktree; none were reverted.

## Recommended Next Step

- Review remaining non-UI work queue items and contract TODOs, then choose the next smallest headless behavior slice. Keep the MVP UI deferred until the non-UI queue is complete and verified.
