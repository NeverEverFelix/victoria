# Multi-Agent Evaluation Harness

`multi-agent-readiness.test.ts` runs the existing `VictoriaAgent` and a scripted specialist team through the frozen starter corpus in `fixtures/multi-agent-scenarios.ts`. It asserts both flows against expected MVP outcomes and verifies that the comparison creates no ledger entries.

`multi-agent-conversations.test.ts` exercises multi-turn cases for low-confidence intent, specialist/core estimate disagreement, and a temporary Savings Reasoning failure. It verifies clarification context, recovery, pending-proposal boundaries, clarified goal-target precedence, and exact approval before mocked ledger writes. These scenarios use mock specialists and remain contract checks, not model-quality evidence.

The scripted specialists use `MockLlmAdapter` and deterministic fixture logic. This is a plumbing and contract-parity check only. Its local elapsed times are not representative provider latency and its output has no model token or price data.

In the frozen provider corpus, `expectedIntent` is the financial-moment classification for the current utterance; `expectedAction` also reflects conversation context. For example, a short confirmation may classify as `unclear` on its own while still authorizing the exact pending proposal through the separate approval policy.

`metrics.ts` computes nearest-rank p50 and p95 summaries across turns. A provider-backed evaluation should use the same corpus and summary shape, add provider usage/cost data, record model and prompt versions, and retain per-role timings. Do not compare the scripted mock timings with the proposed service targets.

The frozen 50-turn synthetic corpus is `fixtures/provider-eval-v1.json`; evaluation design and blinded review instructions are in `../../docs/architecture/multi-agent-evaluation-protocol.md`. `templates/blinded-review.csv` is the reviewer sheet and `templates/provider-run-report.json` defines run metadata and summary fields. Expected safety outcomes must stay fixed during a comparison. Use a separate holdout set when tuning prompts or routing. The corpus is prepared but is not yet consumed by an end-to-end provider comparison runner.

## Provider smoke evaluation

`npm run eval:provider:financial-moment` runs an opt-in OpenAI-backed check over the original seven starter cases. It defaults to `gpt-6-luna`; override with `OPENAI_EVAL_MODEL` if needed and set `OPENAI_API_KEY` in the process environment. It makes seven provider requests and can incur API charges. The report includes model/schema/prompt versions, classification and amount contract results, latency samples, token counts, and request IDs. It does not consume `provider-eval-v1.json`, compare complete runtime arms, estimate cost, or include blinded human review. It is a smoke check only and does not satisfy the 50-turn readiness gate. Ordinary `npm run check` skips this live evaluation.

`npm run agent:smoke:provider-team` loads local config through Next's env loader and runs one synthetic avoided-spend turn through the complete provider team, using mock memory and ledger tools. It stops before user approval and asserts that the mock ledger remains empty. It may make up to three provider requests and incur charges. The command fails unless `APP_ENV=local`, `OPENAI_AGENT_TEAM_ENABLED=true`, `OPENAI_MODEL` is a real model ID, and `MONEY_MOVEMENT_MODE=mock_ledger`. It is opt-in and skipped by normal test/check commands.

For copyable setup and run commands, see [`docs/provider-agent-team-smoke.md`](../../docs/provider-agent-team-smoke.md).
