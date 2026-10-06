# Session: Add state setup for frozen evaluation cases

- Date: 2026-10-06
- Time: 14:28 America/New_York
- Status: Completed locally
- Scope: Define deterministic mock-backed state preludes for approval and correction cases in the frozen provider evaluation corpus.

## Outcome

P31–P35 can now start with a pending $20 proposal, and P50 can start with a normally approved $20 mock-ledger entry. Setup definitions live separately from the frozen case data, and tests pin the original corpus SHA-256.

## Work Completed

- Added [provider-eval-v1-setups.ts](../../tests/evaluation/fixtures/provider-eval-v1-setups.ts) with prelude definitions and a helper that checks each setup action and resulting ledger/proposal state.
- Added [provider-eval-setups.test.ts](../../tests/evaluation/provider-eval-setups.test.ts) covering the five pending-proposal cases, P50's prior entry, and the frozen corpus hash.
- Documented setup semantics in the [evaluation README](../../tests/evaluation/README.md), [evaluation protocol](../architecture/multi-agent-evaluation-protocol.md), and [multi-agent readiness](../architecture/multi-agent-readiness.md).

## Decisions

- Evaluation setup uses the ordinary mock-backed agent flow. P50's prior entry is created by proposal plus exact approval, not inserted directly into the ledger.
- The frozen corpus JSON remains unchanged; the companion test verifies SHA-256 `2bf4b48684abe591d2108afafc059bed871735f0caa6c53b43f33e13a24e562c`.

## Verification

- `npx vitest run tests/evaluation/provider-eval-setups.test.ts` — passed: 7 tests.
- `npm run check` — passed: agentic validation, lint, both TypeScript checks, and 271 tests passed; three files skipped, two tests skipped, one todo.
- No API key or live provider call was used.

## Unresolved

- The setup helper prepares state but does not yet run/score target turns for the 50-case corpus.
- P34's contextual approval wording and P50's two-dollar correction wording still need to be proven against both complete runtime arms during runner development.

## Recommended Next Step

Build an offline case runner that applies these setup steps, executes each frozen target message, and records actual action, amount, and ledger effects for the deterministic baseline and specialist arms. Preserve the frozen target corpus and keep outputs labeled as mock contract results.
