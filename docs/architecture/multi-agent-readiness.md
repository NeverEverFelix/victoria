# Multi-Agent Runtime Readiness

This document separates a tested prototype from a production-capable runtime. It is a readiness checklist, not authorization to add a model provider, persistence layer, or banking integration.

## Current Position

Victoria has a safety-tested, in-memory single-agent MVP and an advisory specialist orchestration prototype. The prototype has typed sequential handoffs, separate assessment and response policy modules, safe specialist-failure behavior, and a three-call ceiling with local elapsed-time measurement.

The deterministic seven-case corpus in `tests/evaluation/` checks that the current agent and a scripted specialist team preserve selected MVP outcomes. Both use the same mock classifier and scenario-authored specialist behavior. It computes local nearest-rank latency summaries across turns, but those mock timings are not representative. This verifies contract parity and orchestration plumbing; it does **not** measure model quality, specialist value, provider latency, token usage, or dollar cost. See the [evaluation harness notes](../../tests/evaluation/README.md).

No provider-backed specialist is wired in. There are no HTTP route handlers, durable turn/conversation records, durable pending proposals, or cross-process conversation locks. The live `VictoriaAgent` retains pending conversational state in process memory. These are production readiness gaps, not prototype failures.

## Readiness Stages

### Stage 1: Headless Prototype — Current

- [x] Keep the existing single-agent runtime unchanged.
- [x] Define Financial Moment, Savings Reasoning, and Companion Voice handoff contracts.
- [x] Keep deterministic assessment, response, approval, and ledger policy outside specialists.
- [x] Exercise specialist disagreement, malformed output, failure, and required wording.
- [x] Cap specialist calls and capture local per-role timing; summarize multi-turn p50/p95 in the evaluation harness.
- [x] Add a scenario corpus covering amount, ambiguity, estimates, regret, transfers, and multiple amounts.

### Stage 2: Provider Evaluation — Before Runtime Migration

- [ ] Agree on a provider/model strategy and where each role runs.
- [ ] Define provider-specific structured-output schemas and versioned prompts.
- [ ] Evaluate the same frozen scenario set against the single-agent baseline and the specialist implementation.
- [ ] Add blinded human review for tone, clarity, and companion value; automated contract assertions alone are insufficient.
- [ ] Add adversarial cases for prompt injection, unsupported financial claims, specialist disagreement, and partial provider outages.
- [ ] Record per-role latency, p50/p95 turn latency, input/output tokens, estimated cost, retry count, and specialist-call count.
- [ ] Apply the proposed scorecard in [`multi-agent-evaluation-protocol.md`](./multi-agent-evaluation-protocol.md) to a frozen, at-least-50-turn provider-backed corpus.
- [ ] Review and accept or revise the proposed p50 2.5 s, p95 5 s, and hard 8 s turn targets.
- [ ] Review and accept or revise the proposed 2× baseline cost guardrail; set an absolute cap only after expected usage and business economics are known.

### Stage 3: Server And Durable State — Before Production

- [ ] Define the authenticated request boundary, validate user and conversation ownership, and add route-handler contract tests.
- [ ] Persist accepted turns before execution, with idempotency keys and recoverable queued/running/completed/failed state.
- [ ] Persist conversation messages, pending proposals, approvals, and immutable history; remove reliance on process-local pending-action maps in the production path.
- [ ] Enforce conversation ordering/leases across instances and storage-level approved-action uniqueness (`IDM-004`).
- [ ] Add adapter contracts for turn storage, conversation leases, model providers, and telemetry without coupling policy to providers.
- [ ] Test cross-user isolation, replay, concurrent turns, process restarts, provider timeout, cancellation, and uncertain write outcomes.

### Stage 4: Controlled Runtime Introduction

- [ ] Keep the single-agent path available as a fallback while the specialist path is disabled by default.
- [ ] Add a kill switch and staged rollout controls that cannot weaken approval policy or enable real money movement.
- [ ] Add traces for role, schema version, correlation/turn ID, timings, usage, and validated outcomes; do not persist hidden chain-of-thought.
- [ ] Run operational load tests against the accepted capacity contract and provider limits.
- [ ] Review ADR 0001 and ADR 0002 and accept them only after their open product and operational decisions are resolved.

## Today’s Evaluation Gate

The checked-in deterministic evaluation is a smoke and contract-parity baseline. The next meaningful quality evaluation requires a provider-backed specialist adapter and human-reviewed examples. Do not label scripted results as evidence that three model calls outperform one model call. The proposed numeric thresholds remain unaccepted until they are reviewed against measured provider behavior and product economics.

Production multi-agent readiness is reached only when Stages 2 and 3 have explicit pass evidence and Stage 4's operational controls are implemented. The MVP's real-money prohibition remains in force throughout.
