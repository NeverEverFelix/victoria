# Session: Multi-Agent Evaluation Thresholds

- Date: 2026-10-04
- Time: 12:11 EDT
- Status: Completed
- Scope: Finalize proposed quality, latency, and cost criteria and align the headless evaluation instrumentation.

## Outcome

Added a provider-evaluation protocol with hard safety gates, proposed quality thresholds, p50/p95 targets, and a relative cost guardrail. The prototype now reports raw per-turn timing only; the test evaluation harness computes nearest-rank percentile summaries across turns. No numeric target is marked as a confirmed product decision.

## Work Completed

- Added [multi-agent-evaluation-protocol.md](../architecture/multi-agent-evaluation-protocol.md) with a 50-turn provider evaluation requirement, blind human review, zero-tolerance safety criteria, proposed voice lift, p50/p95/deadline targets, and cost measurement requirements.
- Linked the protocol from [multi-agent-readiness.md](../architecture/multi-agent-readiness.md), [ADR 0001](../architecture/decisions/0001-orchestrated-multi-agent-architecture.md), [architecture README](../architecture/README.md), and the [agent work queue](../agent-work-queue.md).
- Added [evaluation harness notes](../../tests/evaluation/README.md), nearest-rank percentile calculation in [metrics.ts](../../tests/evaluation/metrics.ts), and tests that summarize baseline and scripted-team timing across the current corpus.
- Removed the prototype's misleading per-turn 2.5-second degraded status. It records raw timings; only a multi-turn provider evaluation can assess the proposed p50/p95 targets.

## Decisions

- Confirmed: hard safety failures remain a no-go regardless of quality, latency, or cost.
- Proposed, pending review: p50 at or below 2.5 seconds, p95 at or below 5 seconds, and an 8-second hard deadline with a safe fallback or clear processing status.
- Proposed, pending review: specialist cost per successful turn at or below 2× baseline absent an explicitly reviewed quality benefit.
- No absolute per-turn/monthly user cost cap was invented; it depends on provider pricing, expected usage, and product economics.
- No provider, live runtime routing, or real money behavior was added.

## Verification

- `npm run check` passed: agent setup validation, lint, both TypeScript checks, and tests (192 passed, 1 todo, 1 skipped).
- `git diff --check` passed.

## Unresolved

- The current seven-case scripted corpus is not sufficient for provider quality claims and has no provider token/cost usage data.
- The 8-second deadline is a proposed requirement, not implemented cancellation behavior.
- A new untracked `analytics/docs/Victoria-product-analytics.md` appeared in the shared worktree during this session. It was not changed and should be preserved/reviewed separately.

## Recommended Next Step

Review and accept or revise the proposed numeric criteria. Then, when provider-backed evaluation is explicitly in scope, expand the corpus to at least 50 turns and collect blinded quality review, real latency percentiles, token usage, retries, and cost.
