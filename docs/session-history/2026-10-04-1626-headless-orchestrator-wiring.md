# Session: Wire the mock headless specialist path

- Date: 2026-10-04
- Time: 16:26 America/New_York
- Status: Completed locally
- Scope: Route agent turns through injected mock specialists while preserving deterministic approval and ledger boundaries.

## Outcome

`VictoriaAgent` now uses the specialist coordinator when a team is injected. Application composition uses mock Financial Moment and Savings Reasoning specialists; live provider and money movement paths remain disabled.

## Work Completed

- Added mock adapters in [mock-specialists.ts](../../src/agent/specialists/mock-specialists.ts) for existing classification and avoided-spend estimation interfaces.
- Updated [VictoriaAgent](../../src/agent/victoria-agent.ts) to consume coordinated findings and reuse the specialist's estimate rather than estimating twice.
- Updated [application composition](../../src/app/create-victoria-agent.ts) and behavior/contract test fixtures to inject mock specialists.
- Added full-agent tests for Financial Moment failure, Savings Reasoning failure, and conflicting explicit amount recommendations. Each case has no proposal, suggestion, write-capable tool call, or ledger entry.
- Updated [agent-work-queue.md](../agent-work-queue.md), [src/agent/README.md](../../src/agent/README.md), and the test plan. Slice P3 is complete; the Companion Voice handoff is next.

## Decisions

- Confirmed: clarification outcomes generated from specialist failures, invalid results, timeouts, or disagreement carry no mutation-capable tool call.
- Confirmed: savings estimates come from the Savings Reasoning specialist once per turn; only deterministic agent policy can proceed to approval and ledger tools.
- Live model calls and money movement remain disabled.

## Verification

- `npm run check` — passed: agentic setup validation, lint, type checks, and 164 tests; 20 todo and one skipped.
- `git diff --check` — passed.
- Two existing unused-parameter lint warnings remain in `src/agent/memory/mock-memory.ts`.

## Unresolved

- The Companion Voice Agent is not yet part of runtime response composition; deterministic response wording remains in `VictoriaAgent`.
- The live model adapter and durable specialist handoff traces remain unimplemented and disabled.

## Recommended Next Step

Add an injected Companion Voice specialist that receives only the verified outcome and permitted response goal. Keep mandatory mocked-ledger disclosures outside its authority and use deterministic wording if the voice specialist fails or returns invalid output.
