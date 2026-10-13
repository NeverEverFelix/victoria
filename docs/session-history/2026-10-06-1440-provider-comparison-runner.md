# Session: Add the provider-backed comparison runner

- Date: 2026-10-06
- Time: 14:40 America/New_York
- Status: Runner implemented and mock-tested; live provider execution remains pending
- Scope: Add a gated live provider comparison over the frozen evaluation corpus and complete the missing approval/correction behavior exposed by the expanded fixture setup.

## Outcome

Implemented a two-arm provider runner for the frozen 50-turn corpus. It records per-role usage, request IDs, estimated costs, latency, outcomes, and safety failures. Its mocked HTTP test passes, and the full repository check passes. No live provider call was made because no usable API key is available.

## Work Completed

- Added [run-provider-comparison.ts](../../tests/evaluation/run-provider-comparison.ts), which runs a Financial Moment baseline and a specialist-team arm with shared state setup and report metrics.
- Added [provider-comparison.test.ts](../../tests/evaluation/provider-comparison.test.ts) for mocked Responses API behavior and [provider-comparison-live.test.ts](../../tests/evaluation/provider-comparison-live.test.ts) for an explicit, local-only live run gate.
- Added `npm run eval:provider:comparison`; live execution requires explicit confirmation, a local API key, a model, and a dated rate card.
- Added P34 exact amount-bound approval and P50 explicit `$18, not $20` correction handling, with unit coverage and updates to the relevant safety and behavior docs.
- Updated [multi-agent-evaluation-protocol.md](../architecture/multi-agent-evaluation-protocol.md), [multi-agent-readiness.md](../architecture/multi-agent-readiness.md), and [tests/evaluation/README.md](../../tests/evaluation/README.md) to distinguish mock plumbing evidence from provider quality evidence.
- Added provider elapsed-time and per-role estimated-cost reporting to the separate usage reporter.

## Decisions

- The comparison runner is evaluation tooling; it does not alter Victoria's mocked-ledger product boundary.
- The intent probe is included in billed usage and scored separately from the target turn because approval shortcuts can bypass normal classification.
- No provider quality conclusion is drawn from the scripted mock comparison. The live run remains opt-in and was not executed.
- Explicit approval only records the pending amount when the response names that exact amount. An explicit correction parser accepts the narrow two-amount form `$18, not $20`.

## Verification

- `npm run check` — passed: agentic validation, lint, application and test TypeScript checks, and 278 tests passed; five files skipped, four tests skipped, one todo.
- `npx vitest run tests/evaluation/provider-comparison.test.ts tests/unit/agent/provider-usage-reporter.test.ts` — passed before the final full check.
- `git diff --check` — passed before the final type correction; rerun before handoff.
- No live provider calls were made.

## Unresolved

- A live 50-turn comparison still requires an API key and approved spend. Supply the key through the ignored local environment file and current dated pricing inputs before invoking `CONFIRM_LIVE_COMPARISON=1 npm run eval:provider:comparison`.
- Retry accounting is currently zero because the adapter has no retry loop. Provider-side failures absorbed by safe fallbacks need more complete per-turn accounting before treating the report as production-grade evidence.
- Raw report persistence and blinded human review remain outstanding evaluation operations.
- The worktree contains earlier provider-usage and evaluation changes; preserve them when reviewing or committing.

## Recommended Next Step

Run the gated provider comparison when credentials and pricing inputs are available, then inspect failures and complete per-turn provider error accounting before drawing conclusions from the comparison.
