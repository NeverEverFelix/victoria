# Session: Conversation architecture review fixes

- Date: 2026-11-01
- Time: 17:10 EST
- Status: Partial
- Scope: Address the actionable conversation-routing and duplicate-file findings from the 2026-11-01 repository architecture review.

## Outcome

Read-only advice about how to use a newly freed recurring expense no longer opens a savings proposal solely because the event was classified as avoided spending. The tracked ` 2` snapshots were removed, and validation now rejects their return. Broader architecture recommendations remain tracked as follow-up work.

## Work Completed

- Added a budgeting-advice route through [`conversation-intent-plan.ts`](../../src/agent/conversation-intent-plan.ts) and [`conversation-routing.ts`](../../src/agent/conversation-routing.ts). Regression coverage verifies a debt-repayment question receives a read-only response and creates no savings entry.
- Updated the employer-covered expense story, MVP description, safety contract, and test plan so a read-only advice request and an explicit request to record have separate behavior.
- Removed 198 tracked ` 2`-suffixed snapshots after checking their canonical counterparts. The divergent suffixed copies were stale subsets of the canonical implementations/tests.
- Added a duplicate-snapshot guard to [`validate-agentic-setup.mjs`](../../scripts/validate-agentic-setup.mjs) with a validator regression test.
- Added finding status and follow-up steps in [`conversation-architecture-review-2026-11-01-follow-up.md`](../architecture/conversation-architecture-review-2026-11-01-follow-up.md) and [`docs/agent-work-queue.md`](../agent-work-queue.md).

## Decisions

- A financial event classification does not by itself establish that the user wants a savings proposal when the same turn asks for read-only advice.
- Explicit requests to record still use the existing proposal flow and exact approval boundary.
- The supplied architecture review is engineering input. Unimplemented design sketches remain proposals unless adopted by the repository's product and safety contracts.

## Verification

- Targeted tests — passed: 3 files, 256 tests.
- `npm run check` — passed: agent validation, lint, source and test type checks, 124 test files passed, 1,107 tests passed, 29 skipped, and 9 todo.
- `git diff --check HEAD` — passed.
- Node emitted existing experimental SQLite warnings during tests.

## Unresolved

- A unified turn coordinator, durable dialogue working state, cross-session financial-history retrieval, and further multi-intent response-quality evaluation remain open.
- Blinded human evaluation of specialist quality and cost/latency tradeoffs remains open.
- Real transfer execution remains outside the MVP boundary.
- The AI Code Review workflow's invalid GitHub Actions API credential must be replaced by the repository owner using secret management; this checkout does not provide the replacement credential or secret-management access.
- Two pre-existing untracked session-history files were preserved: [`2026-11-01-1526-live-local-victoria-challenge.md`](2026-11-01-1526-live-local-victoria-challenge.md) and [`2026-11-01-1559-pr-22-squash-merge.md`](2026-11-01-1559-pr-22-squash-merge.md).

## Recommended Next Step

Implement the next small slice for a unified per-turn reply plan, preserving pending workflows and deterministic approval policy; then add durable dialogue working state only after its provenance and expiry contract is defined.
