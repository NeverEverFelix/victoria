# Multi-Agent Runtime Readiness

This document separates a tested prototype from a production-capable runtime. It is a readiness checklist, not authorization to add a model provider, persistence layer, or banking integration.

## Current Position

Victoria has a safety-tested headless agent, an explicit local provider profile, and an opt-in OpenAI Responses team for Financial Moment classification, Savings Reasoning, and Companion Voice. Local and persistent chat runtimes keep tools in mock-ledger mode. Deterministic validation, proposal creation, amount/tool checks, approvals, ledger writes, and real-transfer refusal remain in the core agent. Provider-team activation in staging or production is not established by local evaluation.

The deterministic seven-case corpus in `tests/evaluation/` checks that the current agent and a scripted specialist team preserve selected MVP outcomes. Unit tests also exercise specialist/core handoffs and confirmation behavior in the live mock composition. These checks use deterministic mocks; they do **not** measure model quality, specialist value, provider latency, token usage, or dollar cost. See the [evaluation harness notes](../../tests/evaluation/README.md).

The headless policy now requires confidence on Financial Moment classifications and Savings Reasoning assessments. Valid classifications and suggestions below the provisional `0.70` floor ask for clarification; unresolved intent keeps short-lived conversation context for the next reply and clears when a clear new intent arrives. Mismatched specialist/core estimates also ask and can continue after the user supplies a supported amount. This floor is not calibrated against a provider and is not evidence of real model confidence quality.

The frozen 50-turn corpus has an initial live provider comparison recorded in `tests/evaluation/reports/provider-comparison-2026-10-29.json`. That run completed with zero money-safety failures, but predates the latest fixes and remains diagnostic. A post-fix run could not be repeated on 2026-10-29 because no usable provider key was available. The randomized blind response packet and rubric are ready, but reviewer scores have not been submitted. The provider runner records per-turn response, role timing, usage, and estimated cost; retry accounting and a post-fix provider report remain open. The local persistent runtime now has PostgreSQL-backed turns, context, pending financial workflows, and mock-ledger entries, with restart/concurrency coverage against loopback PostgreSQL. These local findings do not establish deployed database availability, production authentication/ownership, or multi-worker operational readiness.

The server-state foundation includes a pure lifecycle in `src/domain/turns/lifecycle.ts`, user-scoped repositories, authenticated local chat/queued-turn routes, PostgreSQL migrations, and local persistent composition. The dedicated local PostgreSQL integration suite verifies restart recovery, idempotent mocked entries, scoped history, and concurrent approval outcomes. Hosted migrations and production runtime behavior remain outside this verification. The PostgreSQL-authoritative persistent runtime fails closed if durable pending-action lookup is unavailable; it does not fall back to process-local approval state.

## Readiness Stages

### Stage 1: Headless Prototype — Current

- [x] Keep deterministic core product behavior and financial authority in `VictoriaAgent`.
- [x] Wire deterministic mock specialists into the headless core agent for supported conversational behaviors.
- [x] Define Financial Moment, Savings Reasoning, and Companion Voice handoff contracts.
- [x] Keep deterministic assessment, response, approval, and ledger policy outside specialists.
- [x] Exercise specialist disagreement, malformed output, failure, and required wording.
- [x] Exercise low-confidence clarification context, estimate disagreement, and specialist failure across follow-up turns.
- [x] Cap specialist calls and capture local per-role timing; summarize multi-turn p50/p95 in the evaluation harness.
- [x] Add a scenario corpus covering amount, ambiguity, estimates, regret, transfers, and multiple amounts.

### Stage 2: Provider Evaluation — Before Runtime Migration

- [ ] Agree on a provider/model strategy and where each role runs.
- [x] Define the Financial Moment provider structured-output schema and versioned prompt.
- [x] Add a default-off flag for the provider Financial Moment path.
- [x] Add default-off provider-backed Savings Reasoning and Companion Voice specialists, with deterministic core validation and approval authority.
- [x] Select GPT-6 Luna for the initial cost-sensitive Financial Moment evaluation; production selection remains pending evaluation results.
- [x] Freeze a 50-turn synthetic evaluation corpus and document the blinded human review process.
- [x] Implement a full comparison runner that executes baseline and specialist arms, captures complete responses, per-role timings, usage, and estimated cost; retry accounting remains open.
- [x] Evaluate the frozen 50-turn scenario set against the single-agent baseline and specialist implementation once; the result is diagnostic because it predates recent fixes.
- [ ] Add blinded human review for tone, clarity, and companion value; automated contract assertions alone are insufficient.
- [x] Include adversarial prompt injection, unsupported financial claims, specialist disagreement, and malformed-provider responses in the frozen corpus and failure tests; live partial-outage evaluation remains open.
- [x] Record per-role latency, p50/p95 turn latency, input/output tokens, estimated cost, and specialist calls; retry accounting remains open.
- [x] Apply the scorecard instrumentation in [`multi-agent-evaluation-protocol.md`](./multi-agent-evaluation-protocol.md) to one frozen 50-turn provider-backed run; repeat it after the latest fixes.
- [ ] Review and accept or revise the proposed p50 2.5 s, p95 5 s, and hard 8 s turn targets.
- [ ] Review and accept or revise the proposed 2× baseline cost guardrail; set an absolute cap only after expected usage and business economics are known.

### Stage 3: Server And Durable State — Before Production

- [x] Define a pure queued/running/completed/failed turn lifecycle, including retry under the original turn identity.
- [x] Define user-scoped idempotent turn repository operations and exercise them with an in-memory adapter.
- [x] Define and test a headless authenticated submission boundary with input validation and conversation ownership checks.
- [x] Add a PostgreSQL turn repository with storage-level idempotency uniqueness and atomic revision transitions.
- [ ] Connect the handler to a verified production authenticator and conversation ownership store in a server route.
- [x] Configure a PostgreSQL driver, migration runner, and injectable database-backed turn repository.
- [x] Configure a dedicated local database and verify migrations, replay behavior, restart recovery, and concurrent transitions against real PostgreSQL; hosted behavior remains unverified.
- [ ] Persist accepted turns before execution in the production request path, with recoverable queued/running/completed/failed state.
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

The initial provider-backed comparison is available, but is not release evidence because it predates the latest fixes and has no blinded reviewer scores. Do not label scripted results as evidence that three model calls outperform one model call. The proposed numeric latency and cost thresholds remain unaccepted until they are reviewed against post-fix provider behavior and product economics. The last live report measured specialist p50/p95 latency at 5.441/10.002 seconds and aggregate cost at about 1.82× baseline; this exceeded the proposed latency targets and motivates the simple-turn routing optimization. Multi-stage financial turns still need post-fix measurement.

The provider evaluation command currently exercises the existing seven-case starter corpus and reports classification, deterministic amount fidelity, latency, and token counts. It is a connection/smoke evaluation only; it does not meet the 50-turn comparison, blinded review, or cost reporting gate.

Production multi-agent readiness is reached only when Stages 2 and 3 have explicit pass evidence and Stage 4's operational controls are implemented. The MVP's real-money prohibition remains in force throughout.
