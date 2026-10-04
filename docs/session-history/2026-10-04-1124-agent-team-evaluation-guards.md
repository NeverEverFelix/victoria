# Session: Agent Team Evaluation Guards

- Date: 2026-10-04
- Time: 11:24 EDT
- Status: Completed
- Scope: Add disclosure enforcement, conservative disagreement and failure behavior, and latency instrumentation to the mock-backed agent-team prototype.

## Outcome

The advisory prototype now restores mandatory wording after companion drafting, resolves inconsistent financial advice to clarification, returns safe fallbacks after specialist errors, and reports per-role and total elapsed time. It never invokes more than three specialists per turn. It remains disconnected from live conversations.

## Work Completed

- Extended [team-prototype.ts](../../src/agent/team-prototype.ts) with runtime validation, estimate and approval wording guards, no-transfer disclosures, safe voice fallbacks, conservative handling of amount disagreements, specialist failure recovery, and elapsed-time metrics.
- Expanded [team-prototype.test.ts](../../tests/unit/agent/team-prototype.test.ts) to cover these behaviors and the three-call ceiling.
- Documented the evaluation scope and current limitations in [ADR 0001](../architecture/decisions/0001-orchestrated-multi-agent-architecture.md), the [agent work queue](../agent-work-queue.md), [test plan](../../tests/test-plan.md), and [agent module notes](../../src/agent/README.md).

## Decisions

- Confirmed for the prototype: inconsistent or invalid savings assessments fail conservatively to clarification rather than producing a suggestion.
- Confirmed for the prototype: final text must include the exact suggested amount, explicit confirmation request, and mocked-ledger disclosure; habit-based amounts retain estimate language.
- Proposal only: the 2.5-second default is an evaluation threshold, not a product latency SLA.
- No live runtime migration, model integration, or ledger authority was added.

## Verification

- `npm run check` passed: agent setup validation, lint, both TypeScript checks, and tests (181 passed, 1 todo, 1 skipped).
- `git diff --check` passed.

## Unresolved

- No real provider, token usage, or dollar-cost instrumentation is connected, so provider cost is unknown.
- Timings do not implement provider-side deadlines or cancellation.
- The prototype is not exercised by the live `VictoriaAgent`; deterministic phrase guards do not establish model quality across natural language.
- `IDM-004` remains deferred until durable storage exists.

## Recommended Next Step

Build a representative headless evaluation set and run both the current single-agent adapter and a bounded specialist implementation against it. Compare behavior and latency; connect provider usage metadata only after the adapter contract is explicitly in scope. Do not migrate live conversations until safety and server-boundary checks are complete.
