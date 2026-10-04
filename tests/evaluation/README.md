# Multi-Agent Evaluation Harness

`multi-agent-readiness.test.ts` runs the existing `VictoriaAgent` and a scripted specialist team through the frozen starter corpus in `fixtures/multi-agent-scenarios.ts`. It asserts both flows against expected MVP outcomes and verifies that the comparison creates no ledger entries.

The scripted specialists use `MockLlmAdapter` and deterministic fixture logic. This is a plumbing and contract-parity check only. Its local elapsed times are not representative provider latency and its output has no model token or price data.

`metrics.ts` computes nearest-rank p50 and p95 summaries across turns. A provider-backed evaluation should use the same corpus and summary shape, add provider usage/cost data, record model and prompt versions, and retain per-role timings. Do not compare the scripted mock timings with the proposed service targets.

Add synthetic or consented de-identified cases only. Keep expected safety outcomes fixed during a comparison run, and use a separate holdout set when tuning prompts or routing.
