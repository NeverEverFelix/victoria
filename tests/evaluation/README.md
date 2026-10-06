# Multi-Agent Evaluation Harness

`multi-agent-readiness.test.ts` runs the existing `VictoriaAgent` and a scripted specialist team through the frozen starter corpus in `fixtures/multi-agent-scenarios.ts`. It asserts both flows against expected MVP outcomes and verifies that the comparison creates no ledger entries.

`multi-agent-conversations.test.ts` exercises multi-turn cases for low-confidence intent, specialist/core estimate disagreement, and a temporary Savings Reasoning failure. It verifies clarification context, recovery, pending-proposal boundaries, clarified goal-target precedence, and exact approval before mocked ledger writes. These scenarios use mock specialists and remain contract checks, not model-quality evidence.

The scripted specialists use `MockLlmAdapter` and deterministic fixture logic. This is a plumbing and contract-parity check only. Its local elapsed times are not representative provider latency and its output has no model token or price data.

`metrics.ts` computes nearest-rank p50 and p95 summaries across turns. A provider-backed evaluation should use the same corpus and summary shape, add provider usage/cost data, record model and prompt versions, and retain per-role timings. Do not compare the scripted mock timings with the proposed service targets.

Add synthetic or consented de-identified cases only. Keep expected safety outcomes fixed during a comparison run, and use a separate holdout set when tuning prompts or routing.

## Provider smoke evaluation

`npm run eval:provider:financial-moment` runs an opt-in OpenAI-backed check over the same seven starter cases. It defaults to `gpt-6-luna`; override with `OPENAI_EVAL_MODEL` if needed and set `OPENAI_API_KEY` in the process environment. GPT-6 Luna is listed for cost-sensitive, high-volume tasks and supports the Responses API and Structured Outputs. Current listed rates are $0.10 per million input tokens and $0.50 per million output tokens; check [current model details](https://developers.openai.com/api/docs/models/gpt-6-luna) before running. This makes seven provider requests and can incur API charges. The report includes model/schema/prompt versions, classification and amount contract results, latency samples, token counts, and request IDs. It does not compare the specialist against a provider-backed single-agent baseline, estimate cost, include blinded human review, or satisfy the 50-turn readiness gate. Ordinary `npm run check` skips this live evaluation.
