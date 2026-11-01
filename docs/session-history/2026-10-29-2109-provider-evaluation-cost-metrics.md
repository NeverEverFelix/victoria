# Session: Post-Fix Provider Evaluation and Cost Metrics

- Date: 2026-10-29
- Time: 21:09 EDT
- Status: Provider comparison and local verification complete; external quality and hosted-runtime gates remain open
- Scope: Continue addressing findings in the 2026-10-29 conversation architecture review, verify post-fix behavior with the frozen provider corpus, and correct evaluation/reporting defects found during that run.

## Outcome

Ran the opt-in 50-turn provider comparison after the conversation changes. Both baseline and specialist arms reported zero money-safety failures and completed 48 of 50 turns. Saved the synthetic evaluation report at [provider-comparison-postfix-frozen-2026-10-29.json](../../tests/evaluation/reports/provider-comparison-postfix-frozen-2026-10-29.json). Corrected a stale corpus-hash guard that made the live test fail after the run had completed, and fixed the cost percentile summary so its keys no longer imply milliseconds.

## Evidence

- Baseline: 42/50 intent, 44/50 action, and 48/50 amount matches; p50/p95 target latency 2.478/4.076 seconds; estimated total cost $0.077634.
- Specialist team: 42/50 intent, 45/50 action, and 48/50 amount matches; p50/p95 target latency 7.407/33.593 seconds; estimated total cost $0.133086.
- Both arms had zero money-safety failures and two provider failures. Specialist estimated cost was 1.71 times baseline, with no intent or amount gain and one additional action match.
- The specialist run includes two extreme target-turn latencies of 374.166 and 174.186 seconds. The corresponding successful provider-stage timings total 7.460 and 2.242 seconds. The runner does not currently attribute the remaining elapsed time; investigate before using tail latency to set a product budget.
- The report uses synthetic frozen scenarios and contains generated responses and provider request IDs. It contains no real user messages or credentials. The ledger and financial tools were mocked.
- `npx vitest run tests/evaluation/metrics.test.ts tests/evaluation/provider-comparison.test.ts tests/evaluation/provider-eval-setups.test.ts` — passed, 3 files and 16 tests.
- `npm run check` — passed: agent validation, lint, typecheck, test typecheck, and test suite; 94 files passed, 9 skipped; 953 tests passed, 25 skipped, 9 todo. Lint reports one warning at `tests/unit/agent/memory-orchestrator.test.ts:146` (`_observedThrough`).
- `git diff --check` — passed.

## Changes

- `tests/evaluation/metrics.ts` now has a generic nearest-rank numeric summary for costs, with `p50`, `p95`, and `max` fields.
- `tests/evaluation/run-provider-comparison.ts` uses that summary for cost per turn.
- `tests/evaluation/provider-comparison-live.test.ts` now checks the actual SHA-256 of the frozen corpus.
- `tests/evaluation/README.md` and the [architecture follow-up](../architecture/conversation-architecture-spec-follow-up-2026-10-29.md) now describe the live report contents and the post-fix evidence accurately.

## Confirmed Decisions

- Model interpretation remains advisory. Deterministic policy remains responsible for financial approval, money safety, and writes; real-money movement remains outside the MVP.
- Performance thresholds remain proposals until the product owner approves them.

## Remaining Work

- Obtain blinded human scores for conversational relevance, naturalness, memory usefulness, and fallback quality.
- Diagnose the unexplained target-turn latency tail and decide performance budgets and specialist-routing policy.
- F01 has a model-assisted plan on routed provider-backed turns, but held-out multi-intent/paraphrase scoring remains open. F02 now has content-free categorical disagreement telemetry; a unified model response contract for interpretation and classification and provider-quality evidence remain open.
- F04 remains incremental: `VictoriaAgent` is still a large coordinator. Continue seam-by-seam extraction with parity coverage.
- F06 still needs nonblocking/durable memory-learning work and human relevance scoring.
- F07 still needs hosted multi-worker and outage/recovery verification. Local restart and concurrent approval coverage does not establish hosted parity.
- Durable trace retention/access policy remains undecided; do not add durable raw traces without it.

## Follow-up: Model Interpretation Across Financial Turns

- Changed `VictoriaAgent` to request the validated advisory plan for turns that reach the interpretation stage, including financial turns. Narrow workflow fast paths may still return before interpretation. Deterministic money parsing, exact approval policy, and write authorization remain unchanged.
- Updated the financial-turn regression to prove that model interpretation and financial classification both run while the turn still produces only a pending suggestion and no ledger write.
- Focused verification: `npx vitest run tests/unit/agent/victoria-agent.test.ts tests/unit/agent/turn-understanding.test.ts` — 2 files, 185 tests passed.
- Re-ran the frozen provider comparison at `tests/evaluation/reports/provider-comparison-unified-turn-plan-2026-10-29.json` with the same model and rate card. The run completed in 26m 41s, with zero safety failures. Baseline: 50/50 completed, 44/50 intent, 43/50 action, 48/50 amount; p50/p95 8.665/11.062 s; cost $0.126840. Specialist: 49/50 completed, 42/50 intent, 44/50 action, 47/50 amount; p50/p95 12.300/20.747 s; cost $0.190620.
- The comparison recorded 43 baseline and 48 specialist `turn_understanding` calls. Two specialist target turns took 125.759 and 89.360 seconds, while their successful provider-stage calls totaled 10.563 and 5.457 seconds. The unexplained target-time gap remains open.
- The all-turn interpretation stage increased request count, cost, and latency versus the previous run; the comparison is stochastic, so these runs are evidence of overhead, not a controlled causal estimate. Product-approved quality/performance thresholds are still needed.
- The provider comparison test passed its corpus-hash and zero-safety-failure assertions.
- Final `npm run check` passed after this code change: 94 files passed, 9 skipped; 953 tests passed, 25 skipped, 9 todo. Lint reports the existing warning at `tests/unit/agent/memory-orchestrator.test.ts:146` (`_observedThrough`).
- `git diff --check` passed. Type generation changed `next-env.d.ts`; that generated-only change was restored before handoff.

## Follow-up: Target-Turn Latency Accounting

- The original provider comparison stored setup, intent-probe, and target-stage usage together on each case. This prevented a direct comparison between target latency and successful provider-call time.
- The runner now reports target-stage provider call count, summed provider elapsed time, and the elapsed remainder outside successful provider records, both per turn and as aggregate summaries. The remainder is deliberately not attributed to a cause.
- `tests/evaluation/provider-comparison.test.ts` verifies baseline and specialist target call counts on the mocked case and that the remainder is non-negative. `npx vitest run tests/evaluation/provider-comparison.test.ts tests/evaluation/metrics.test.ts` passed, 2 files and 8 tests.
- A new full live report was not generated for this reporting-only change. The current full-corpus comparison predates these fields; the next run will contain the stage breakdown.
- Used the new runner on P47/P48 only. The 64-second focused run had zero safety failures. Baseline target times were 9.416/11.007 s and specialist times 17.756/13.651 s; recorded provider-call time explained all but 1–45 ms. The 125.759/89.360 s delays from the full run did not recur.
- A trial to parallelize advisory interpretation and financial classification was reverted after regressions showed that the specialist pipeline would receive a context snapshot without the validated advisory plan. The calls remain sequential until they can share the plan without dropping context or changing specialist behavior.
- Final full check before the timing probe passed: 94 files passed, 9 skipped; 953 tests passed, 25 skipped, 9 todo. Focused runner/agent tests passed again after reverting the parallelization trial: 2 files, 184 tests. The live P47/P48 timing probe passed.

## Recommended Next Step

Use blinded reviewers on the frozen packet, then continue a small F01/F02/F04 slice with held-out tests and measured provider-call counts. In parallel, instrument the evaluation runner so each target turn accounts for time spent in successful provider calls, failed provider calls, state access, and orchestration.

## Follow-up: Content-Free Interpretation Comparison

- Added an optional `VictoriaAgent` observer that compares deterministic and model advisory intent/action categories after valid model interpretation. Its payload contains no user text, memory values, or model rationale, and observer failures are swallowed so diagnostics cannot interrupt the turn.
- Exported the deterministic plan conversion for reuse by the comparison path. It remains descriptive and does not influence workflow decisions.
- Updated `tests/test-plan.md` and the architecture crosswalk to reflect that financial turns can execute both model understanding and Financial Moment classification, and that the comparison is categorical and content-free.
- Focused agent and understanding tests passed: 2 files, 185 tests. `npm run typecheck:test` and `npm run typecheck` passed.
- Added assertions for categorical comparison payloads, privacy, and observer failure isolation. Focused tests passed: 3 files, 188 tests.

## Follow-up: Extract Conversational Memory Correction

- Moved conversational remembered-spend target matching, immutable correction persistence, and reply construction from `VictoriaAgent` into `src/agent/memory/memory-correction-service.ts`.
- Added service tests for a unique match (appends a transaction correction referencing the prior memory) and tied matches (asks for clarification and writes nothing). Both remain read-only with respect to savings proposals and ledger entries.
- Updated the architecture crosswalk and behavior test plan for this extraction.
- Full `npm run check` passed after the comparison and correction-service changes: 95 files passed, 9 skipped; 956 tests passed, 25 skipped, 9 todo. The final full check after subsequent metrics and history-service work also passed (results recorded below).

## Follow-up: Memory-Learning Stage Metrics

- Added an optional memory-learning outcome callback reporting only `completed`/`failed`, elapsed milliseconds, and validated candidate count. It emits on both success and error, and callback failures cannot change the user turn.
- Added service tests for content-free metrics and metrics-sink failure isolation; memory learning still passes provider failures through its existing safe fallback.
- Updated the behavior test plan and architecture crosswalk. Provider extraction remains synchronous in some turn paths; a durable idempotent queue and human relevance scoring remain open.
- Focused tests passed: 2 files, 186 tests; both test and source TypeScript checks passed.

## Follow-up: Extract Scoped Savings-History Recovery

- Moved recent completed-entry recovery from `VictoriaAgent` to `src/agent/conversation-savings-history-service.ts` so the user/conversation/event join is an isolated fact-service seam.
- Added coverage that excludes foreign users, entries outside the scoped event set, and pending entries; it also verifies durable empty history invalidates a stale cached result.
- Updated the F04/F07 architecture crosswalk and test plan. Focused tests passed: 2 files, 184 tests; test TypeScript check passed.
- Final `npm run check` passed: 96 files passed, 9 skipped; 959 tests passed, 25 skipped, 9 todo. The only lint warning is the pre-existing `_observedThrough` warning in `tests/unit/agent/memory-orchestrator.test.ts:146`. `git diff --check` passed; generated `next-env.d.ts` was restored.

## Follow-up: Extract Read-Only Reply Assembly

- Moved memory retrieval, episode lifecycle suppression, relevant-memory selection, response preference selection, verified calculation attachment, event-history filtering, and read-only reply delegation into `src/agent/conversation-turn-reply-service.ts`.
- Added service coverage proving a relevant memory is retained while unrelated savings-event history is removed unless explicitly supplied by the caller. Existing agent, memory, and responder integration tests also pass.
- Updated the F04 crosswalk and behavior test plan. Focused verification passed: 3 files, 265 tests. Final `npm run check` passed: 97 files passed, 9 skipped; 960 tests passed, 25 skipped, 9 todo. One pre-existing lint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:146` (`_observedThrough`). `git diff --check` passed; generated `next-env.d.ts` was restored.
