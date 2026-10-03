# ADR 0001: Orchestrated Multi-Agent Architecture

- Status: Proposed
- Date: 2026-10-01
- Scope: Victoria's headless agent runtime

## Context

Victoria must understand natural-language financial moments, use evolving memory, reason about possible savings, and maintain a supportive long-term relationship with the user. It must also preserve strict approval, mocked-ledger, auditability, and immutable-history boundaries.

A single unrestricted agent would combine too many responsibilities and could blur the line between conversational reasoning and financial authority. A peer-to-peer agent swarm would make routing, final-response ownership, and financial audit trails unnecessarily difficult to reconstruct.

## Proposed Decision

Use a supervisor-style multi-agent architecture centered on one Victoria Orchestrator.

The initial agent team will contain:

1. **Victoria Orchestrator** — owns the turn, routes work, combines findings, and proposes the next action.
2. **Financial Moment Agent** — interprets financial events and extracts candidate facts.
3. **Savings Reasoning Agent** — evaluates evidence and recommends savings proposals.
4. **Companion Voice Agent** — maintains Victoria's supportive conversational identity and produces the final user-facing response from verified facts.

Specialists communicate through the orchestrator and return typed advisory outputs. They do not call one another directly. Only the Companion Voice Agent normally produces user-facing prose.

Deterministic application code retains exclusive authority over:

- Input and output schema validation.
- Amount validation and cents arithmetic.
- Proposal state transitions.
- Exact-action and exact-user approval binding.
- Idempotency and replay handling.
- Tool authorization.
- Mocked-ledger writes and totals.
- Real-money prohibitions.
- Append-only financial history.

The initial architecture is shown in [`victoria-agentic-architecture.md`](../diagrams/victoria-agentic-architecture.md).

## Why An Orchestrator

- Gives the user one coherent Victoria rather than several visible personalities.
- Makes specialist selection and turn ownership explicit.
- Provides one place to assemble context and reconcile disagreement.
- Keeps all proposed mutations on a traceable path to deterministic policy.
- Allows new specialists to be introduced without granting them direct financial authority.

## Why A Dedicated Companion Voice

Victoria's relational quality is a core product capability, not incidental response formatting. A dedicated specialist can consistently apply the intended calm, encouraging, practical, and nonjudgmental voice while financial specialists remain focused on evidence.

The companion role is intentionally not represented as clinical therapy. It may use reflective listening and behavior-change techniques, but it must not diagnose, claim professional credentials, or create emotional dependency.

## Tradeoffs

### Benefits

- Specialist prompts and evaluations can focus on one responsibility.
- Financial reasoning can be reviewed separately from conversational tone.
- A single final voice reduces personality drift.
- Structured handoffs improve auditability and testing.
- The orchestrator can avoid invoking agents that a simple turn does not need.

### Costs And Risks

- Multiple model calls increase latency and cost.
- Specialists may disagree or repeat work.
- More contracts, prompts, traces, and failure paths must be maintained.
- A powerful orchestrator can become an opaque monolith if its decisions are not structured.
- A companion model could soften or omit important financial disclosures.
- Shared context can become excessive or leak information irrelevant to a specialist.

### Mitigations

- Route only to specialists required for the current turn.
- Parallelize independent, read-only analysis only when results can be deterministically joined.
- Use narrow, versioned schemas for every agent handoff.
- Treat all agent output as untrusted until validation succeeds.
- Pass locked financial facts and mandatory disclosures to the Companion Voice Agent.
- Record agent role, input references, output, schema version, and correlation identifiers for each turn without storing hidden reasoning.
- Preserve deterministic and mock implementations for headless tests.

## Alternatives Considered

### One General-Purpose Agent

Simpler and cheaper, but it combines interpretation, financial reasoning, policy-sensitive action selection, and tone in one probabilistic boundary.

### Peer-To-Peer Agent Swarm

Flexible, but it obscures ownership, encourages uncontrolled delegation, and complicates reconstruction of why a financial action was proposed.

### Fully Deterministic Workflow

Highly testable, but too rigid for the varied language, emotional context, and evolving behavioral relationship central to Victoria.

## Consequences If Accepted

- Agent roles and handoff schemas become first-class contracts under `src/agent/`.
- The current `VictoriaAgent` evolves toward an orchestrator rather than a single all-purpose implementation.
- Financial policy and tools remain independent of agent prompts and model providers.
- Tests cover routing, structured handoffs, disagreement, specialist failure, disclosure preservation, and prohibited mutations.
- New agents require an explicit responsibility boundary and must not receive unnecessary user or financial context.

## Open Decisions

- Whether the Companion Voice Agent performs emotional-context assessment and final composition in one call or two bounded stages.
- The minimum specialist set for the first executable multi-agent slice.
- Model selection, latency budget, and per-turn call budget for each role.
- The durable trace format for agent handoffs without retaining hidden reasoning.
- Whether habit analysis remains a memory service or later becomes a specialist agent.

## Acceptance Condition

Change this record from `Proposed` to `Accepted` only after the product owner confirms the responsibility boundaries and the initial specialist set. Any later material change should be recorded in a new ADR that supersedes this one.
