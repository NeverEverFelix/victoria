# Session: Add the Companion Voice handoff

- Date: 2026-10-04
- Time: 16:32 America/New_York
- Status: Completed locally
- Scope: Add a mock-backed Companion Voice handoff with deterministic safeguards and fallback wording.

## Outcome

`VictoriaAgent.respond` now passes a minimal verified outcome and permitted response goal to an injected Companion Voice specialist. Application composition uses a mock voice implementation. The handoff has a five-second timeout and rejects drafts that change monetary amounts, omit required ledger or movement wording or estimate provenance, claim money moved, or use shaming language. Rejected or failed output falls back to the original deterministic response.

## Work Completed

- Added the voice contract, mock implementation, and draft validator in [companion-voice.ts](../../src/agent/specialists/companion-voice.ts).
- Wired response composition into [VictoriaAgent](../../src/agent/victoria-agent.ts) and injected the mock implementation in [create-victoria-agent.ts](../../src/app/create-victoria-agent.ts).
- Added tests for permitted input scope, valid composition, missing disclosure, unsupported amount, specialist failure, and timeout cancellation in [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts), plus direct draft-validation cases in [companion-voice.test.ts](../../tests/unit/agent/specialists/companion-voice.test.ts).
- Updated [ADR 0001](../architecture/decisions/0001-orchestrated-multi-agent-architecture.md), [agent-work-queue.md](../agent-work-queue.md), [failure-modes.md](../failure-modes.md), [test-plan.md](../../tests/test-plan.md), and [src/agent/README.md](../../src/agent/README.md). Slice P4 is complete.

## Decisions

- Confirmed: the voice role receives verified action facts and the canonical permitted response goal, without raw user message, user ID, or memory.
- Confirmed: voice output has no authority to change financial amounts, estimate provenance, ledger or transfer disclosures, or the nonjudgmental boundary.
- Confirmed: live model calls and money movement remain disabled.

## Verification

- `npm run check` — passed: agentic setup validation, lint, type checks, and 174 tests; 20 todo and one skipped.
- `git diff --check` — passed.
- Two existing unused-parameter lint warnings remain in `src/agent/memory/mock-memory.ts`.

## Unresolved

- The mock voice specialist echoes the canonical response goal; no live voice provider or durable handoff trace is configured.
- Output validation is deterministic and narrow. Broader factual and tone evaluation remains future work.

## Recommended Next Step

Define a bounded specialist handoff trace contract that records role, schema version, correlation ID, status, and timing without hidden reasoning or unnecessary user data. Keep persistence disabled until a durable storage boundary is approved.
