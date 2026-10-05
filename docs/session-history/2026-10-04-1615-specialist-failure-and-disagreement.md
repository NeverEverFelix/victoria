# Session: Define specialist failure and disagreement handling

- Date: 2026-10-04
- Time: 16:15 America/New_York
- Status: Completed locally
- Scope: Establish headless multi-agent coordination behavior while keeping live provider and money movement use disabled.

## Outcome

Accepted the specialist boundaries in ADR 0001 and implemented a tested coordinator foundation. Specialist failure, timeout, invalid output, and material disagreement stop proposal preparation and produce a clarification outcome.

## Work Completed

- Added typed specialist interfaces and `coordinateSpecialists` in [coordinator.ts](../../src/agent/specialists/coordinator.ts). Calls have a bounded time budget, receive an abort signal, and return structured fail-closed outcomes without provider error text.
- Added tests for aligned findings, financial moment and savings reasoning failure, timeouts, malformed output, explicit amount disagreement, and not routing unclear moments to savings reasoning in [coordinator.test.ts](../../tests/unit/agent/specialists/coordinator.test.ts).
- Exported the coordinator and documented the authority boundary in [src/agent/README.md](../../src/agent/README.md).
- Accepted the architecture roles and documented failure/disagreement rules in [ADR 0001](../../docs/architecture/decisions/0001-orchestrated-multi-agent-architecture.md), [agent-work-queue.md](../agent-work-queue.md), [failure-modes.md](../failure-modes.md), and [test-plan.md](../../tests/test-plan.md).

## Decisions

- Confirmed: the initial team comprises the Victoria Orchestrator, Financial Moment Agent, Savings Reasoning Agent, and Companion Voice Agent.
- Confirmed: specialist outputs remain advisory; specialist failure, invalid output, timeout, or conflict between a user-provided amount and a recommendation routes to clarification.
- Confirmed: live provider and real money movement use remain disabled during headless path development.
- No amount averaging or silent preference between conflicting specialist results.

## Verification

- `npm run check` — passed: agentic setup validation, lint, type checks, and 161 tests; 20 todo and one skipped.
- `git diff --check` — passed.
- Two existing unused-parameter lint warnings remain in `src/agent/memory/mock-memory.ts`.

## Unresolved

- The coordinator is not yet wired into `VictoriaAgent` or application composition. Existing application behavior remains mock-backed and unchanged.
- Specialist adapter implementations, cross-specialist evidence schemas beyond the initial amount consistency rule, and durable handoff traces remain future work.

## Recommended Next Step

Wire the coordinator through a headless orchestrator adapter with mock specialists, then test complete agent responses and prove clarification paths carry no mutation-capable tool call.
