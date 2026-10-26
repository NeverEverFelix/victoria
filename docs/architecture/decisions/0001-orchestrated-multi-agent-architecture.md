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

## Prototype Status (2026-10-04)

The product owner requested a headless prototype using Financial Moment, Savings Reasoning, and Companion Voice specialists. This confirms the initial role roster for the prototype. It does not yet accept this ADR as the production runtime architecture: the current `VictoriaAgent` remains authoritative, and model selection, call/latency budget, durable tracing, and production runtime migration remain unresolved.

The prototype in `src/agent/team-prototype.ts` tests sequential, typed, advisory handoffs with injected mock specialists. The mock composition also wires `AgentTeamSpecialists` into `VictoriaAgent`: Financial Moment provides classification; validated Savings Reasoning and Companion Voice support avoided-spend, unclear, and regretful-spend responses. The existing deterministic core remains the authority for proposal creation, approvals, tool calls, and all ledger changes. Inconsistent advice downgrades to clarification; voice wording is checked for disclosures, completed-action claims, shaming, and unsupported amounts.

The prototype records raw local elapsed times only. Percentiles are calculated across evaluation runs; provider tokens and dollar cost are not measured because no provider adapter is connected. The proposed latency targets live in `multi-agent-evaluation-protocol.md` and have not been measured or accepted. The integrated path currently uses deterministic mock specialists only; it does not represent provider-backed quality evidence or production runtime readiness.

Production readiness gates are tracked in [`multi-agent-readiness.md`](../multi-agent-readiness.md). The scripted evaluation corpus is a contract-parity smoke test only; provider quality and cost remain unmeasured.

Proposed provider-evaluation criteria are in [`multi-agent-evaluation-protocol.md`](../multi-agent-evaluation-protocol.md). Its numeric latency and cost thresholds remain proposals pending review and measurement.

## Conversation Context Direction (2026-10-25)

The product owner confirmed the direction of the [conversation context architecture review](../../VICTORIA_CONVERSATION_CONTEXT_ARCHITECTURE_REVIEW.md): retain a single Victoria orchestrator and advisory specialists, and give the orchestration path explicit context assembly, reference resolution, and structured workflow-state management. These are orchestration capabilities, not additional agents with financial authority.

The intended responsibilities are:

- **Context Builder:** assemble a bounded, provenance-aware view of recent dialogue, relevant memory, grounded financial facts, and the active workflow.
- **Intent and Reference Resolver:** map the user's current wording to typed intent and references in that context. Model output may propose references, but application code validates them.
- **Conversation State Manager:** apply validated choices and revisions to scoped workflow state, preserving proposal identity/version and invalidating stale approval when the proposed action changes.
- **Victoria Orchestrator and deterministic policy/domain layer:** route specialists, validate handoffs, own proposal transitions, require exact-action confirmation, and retain exclusive authority over ledger/tool mutations.

The repository has a bounded [conversation context builder](../../src/agent/conversation-context-builder.ts) that assembles relevant user turns, provenance-labeled recurring-cost facts, deterministic annual projections, and a read-only active-workflow summary for Financial Moment and Savings Reasoning. Financial Moment may propose a fact ID and period; application code validates that pair against the supplied facts and passes the resolved fact downstream with provenance and conditions. For a pending monthly proposal, a validated reference to the selected annual projection can produce a safe explanation while preserving the proposal identity and recordable amount. “12-month projection” and “projection for the next twelve months” resolve as annual by deterministic reference resolution. This is a first slice of the proposed Context Builder and Intent/Reference Resolver: selected memory assembly, durable event identity, and a general typed conversation state manager remain future work. The specialists can interpret this context but cannot authorize or mutate an action. The specialist prototype is not a replacement for the runtime's deterministic action authority. This direction does not accept the review's illustrative interfaces, persistence schema, or production rollout plan as final decisions. Those require narrow design slices and the existing product/safety contracts remain controlling.

For the MVP, an annualized amount remains a conditional planning projection. Choosing an annual target does not create a projection ledger entry or count projected money as realized savings. Only the current-period amount may be proposed for the mocked savings ledger, and it still requires explicit confirmation. A future projection or goal record needs its own product/domain decision and separate reporting semantics.
