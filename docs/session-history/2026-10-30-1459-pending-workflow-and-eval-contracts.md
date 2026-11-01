# Session: Pending Workflow and Evaluation Contracts

- Date: 2026-10-30
- Time: 14:59 America/New_York
- Status: Partial
- Scope: Continue implementation-level work on review findings F04 and F08.

## Outcome

Moved durable pending-workflow restoration, expiry coordination, and terminal persistence out of `VictoriaAgent`. Also corrected the provider-comparison report template so it matches the runner's current machine-readable output and added a regression for that contract.

## Work Completed

- Added [`pending-workflow-persistence-service.ts`](../../src/agent/pending-workflow-persistence-service.ts) for scoped restoration validation, in-memory expiry coordination, and terminal persistence across savings proposals, goal allocations, and entry corrections.
- Updated [`victoria-agent.ts`](../../src/agent/victoria-agent.ts) to delegate these operations; approval and money-mutation decisions remain in the existing deterministic workflow boundaries.
- Added direct service coverage for rejecting cross-user restored proposals and expiring state only in the request's exact user/conversation scope.
- Updated [`provider-run-report.json`](../../tests/evaluation/templates/provider-run-report.json) with target provider call/time metrics, the four provider roles, current latency/cost summary shapes, route categories, and per-turn fields.
- Added a structural regression in [`provider-comparison.test.ts`](../../tests/evaluation/provider-comparison.test.ts), and updated the evaluation README, test plan, and review crosswalk.
- The repository already had broad uncommitted review-follow-up work. No commit, deployment, hosted migration, or real-money operation was performed.

## Decisions

- Pending workflow persistence is orchestration; deterministic approval and mutation authority remain where they were.
- The provider report template is a tested contract for future measurements. It does not itself establish live provider savings or quality.
- Human, provider-backed, and hosted operational gates remain open until their evidence exists.

## Verification

- Focused `npx vitest run tests/unit/agent/pending-workflow-persistence-service.test.ts tests/unit/agent/victoria-agent.test.ts`: 190 passed.
- Focused `npx vitest run tests/evaluation/provider-comparison.test.ts`: 3 passed.
- `git diff --check`: passed.
- `npm run check`: passed; 108 test files passed, 9 skipped; 1,022 tests passed, 27 skipped, 9 todo.
- SQLite experimental warnings appeared during the suite.

## Unresolved

- F04 is still partial; `VictoriaAgent` remains a large coordinator and needs further parity-tested extraction.
- F08 still needs a live provider comparison after routing changes, plus product-approved latency/cost targets and blinded human scores.
- The wider review still includes open hosted reliability, memory relevance, and conversational quality validation.

## Recommended Next Step

Continue an evidence-based F01–F08 audit, prioritizing the next implementation gap that can be closed without altering approval semantics, then rerun the full check and update the crosswalk.
