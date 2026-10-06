# Session: Run the frozen corpus through offline comparison arms

- Date: 2026-10-06
- Time: 14:33 America/New_York
- Status: Completed locally; live provider comparison still needs credentials
- Scope: Add a no-key full-corpus comparison runner and use its findings to close two deterministic transfer-classification gaps.

## Outcome

Added `npm run eval:provider:mock-comparison`, which replays all 50 frozen target cases through a deterministic baseline and scripted specialist arm, including state preludes for P31–P35, P49, and P50. Both arms report zero safety failures. Their mock contract metrics match at 26/50 intents, 29/50 actions, and 35/50 exact amounts; these are deterministic plumbing results, not provider-quality evidence.

## Work Completed

- Added [run-mock-provider-comparison.ts](../../tests/evaluation/run-mock-provider-comparison.ts) and the opt-in [mock-provider-comparison.test.ts](../../tests/evaluation/mock-provider-comparison.test.ts), plus the `eval:provider:mock-comparison` script.
- Expanded [provider-eval-v1-setups.ts](../../tests/evaluation/fixtures/provider-eval-v1-setups.ts) to seed P49 stale-estimate context. The frozen JSON hash remains unchanged.
- The offline run exposed P43 and P44 as unsafe deterministic classifications. Expanded transfer phrase recognition in [mock-llm.ts](../../src/agent/llm/mock-llm.ts) and added regressions in [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts).
- Updated [test-plan.md](../test-plan.md), [failure-modes.md](../failure-modes.md), evaluation docs, and readiness notes.

## Decisions

- The scripted comparison stays explicitly labeled as a mock contract run and is not used as evidence for model quality, latency, or cost.
- The P43/P44 deterministic classifications are real-money movement requests and route to refusal; no ledger or transfer tool call is allowed.
- This entry updates the prior state-setup entry: P49 also requires stale-estimate conversation setup.

## Verification

- `npm run eval:provider:mock-comparison` — passed across both 50-turn arms; 0 safety failures per arm.
- `npm run check` — passed: agentic validation, lint, both TypeScript checks, and 274 tests passed; four files skipped, three tests skipped, one todo.
- `git diff --check` — passed.
- No API key or live provider calls were used.

## Unresolved

- The real provider-backed comparison runner and live comparison remain unfinished. The earlier local smoke command confirmed there is no usable `OPENAI_API_KEY` in the environment or ignored `.env.local`.
- The mock arms currently miss many expected classification/action/amount outcomes; do not tune the frozen corpus to make the mock score higher.
- Per-role latency, retry accounting, raw provider report persistence, and blinded human review remain required for Stage 2.

## Recommended Next Step

Implement the provider-backed runner using the same state setup and report contracts. When a valid local key is available, run both provider arms against the frozen corpus with explicit cost confirmation, then prepare blinded response sheets. Keep any production rollout decision separate until server/durable-state gates are met.
