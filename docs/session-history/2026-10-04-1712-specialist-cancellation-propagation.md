# Session: Propagate specialist cancellation

- Date: 2026-10-04
- Time: 17:12 America/New_York
- Status: Completed locally
- Scope: Carry orchestrator cancellation signals through model and read-only savings-estimation contracts.

## Outcome

Required abort signals now flow from specialist timeouts through the mock Financial Moment and Savings Reasoning specialists to their adapter contracts. The orchestrator continues to ignore results that arrive after timeout. `VictoriaAgent` requires injected specialists, removing its direct classification path.

## Work Completed

- Added required signals to [LLM adapter inputs](../../src/agent/llm/types.ts) and read-only estimation inputs in [tool contracts](../../src/agent/tools/contracts.ts).
- Forwarded signals from [mock specialists](../../src/agent/specialists/mock-specialists.ts) and added abort checks to [mock adapters](../../src/agent/llm/mock-llm.ts) and [mock tools](../../src/agent/tools/mock-tools.ts).
- Removed the direct LLM classifier fallback from [VictoriaAgent](../../src/agent/victoria-agent.ts); every message now goes through the bounded specialist coordinator.
- Added tests for signal propagation, already-aborted adapters, specialist cancellation, and ignoring late results in [cancellation.test.ts](../../tests/unit/agent/specialists/cancellation.test.ts) and [coordinator.test.ts](../../tests/unit/agent/specialists/coordinator.test.ts).
- Marked the cancellation slice complete in [agent-work-queue.md](../agent-work-queue.md) and updated the [runtime readiness review](../architecture/specialist-runtime-readiness.md).

## Decisions

- Confirmed: model adapters and read-only spend-estimation tools must receive and honor an abort signal; late results cannot affect a timed-out turn.
- Confirmed: VictoriaAgent requires specialist injection and has no direct classifier bypass.
- Live provider use remains disabled; real adapter cancellation is not yet verifiable.

## Verification

- `npm run check` — passed: agentic setup validation, lint, type checks, and 185 tests; 20 todo and one skipped.
- `git diff --check` — passed.
- Two existing unused-parameter lint warnings remain in `src/agent/memory/mock-memory.ts`.

## Unresolved

- A future model or database adapter must implement actual cancellation and reject or discard any late output. Current mock tests prove signal delivery and orchestration behavior only.
- Specialist inputs still include more context and identifiers than a provider-facing model needs.

## Recommended Next Step

Minimize model-facing context: remove user IDs and tool handles from provider-facing inputs, pass only role-specific facts and relevant memory, and add tests that enforce each role's input allowlist.
