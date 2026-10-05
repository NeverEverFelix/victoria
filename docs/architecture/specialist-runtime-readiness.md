# Specialist Runtime Readiness Review

- Reviewed: 2026-10-04
- Status: Not ready for live specialist providers
- Runtime mode: Mock specialists only; durable traces and real money movement remain disabled

This review checks the current headless multi-agent path before any live model adapter is considered. It records confirmed implementation facts and follow-up work; it does not authorize live use.

## Current Safeguards

- [`createVictoriaAgent`](../../src/app/create-victoria-agent.ts) composes mock specialists and rejects any AI model setting other than `mock` because no live adapter is wired.
- Environment configuration rejects real money movement in every environment.
- Financial specialists return advisory structured findings. Deterministic policy retains approval and ledger-write authority.
- Companion Voice receives a restricted outcome and canonical response goal. Draft checks protect amounts, estimate provenance, movement disclosures, and tone.
- Handoff traces exclude input and output content and are capped at 1,000 records per agent instance.

## Readiness Gaps

### Cancellation Is Required At Adapter Boundaries; Live Cooperation Remains Unverified

The current contracts now require an `AbortSignal` for model classification/drafting and read-only spend estimation. Mock specialists forward the signal, and the mock model/tool adapters check it. The orchestrator ignores results that arrive after timeout. No live adapters exist yet, so actual provider/database cancellation remains unverified; every future adapter must honor the signal or document how late results are safely discarded.

### Specialist Context Is Minimized For The Current Path

Financial Moment receives only the user message and cancellation signal; it no longer receives `AgentMemory`. Savings Reasoning receives an allowlisted avoided-spend fact object; user IDs, raw classification summaries, and tool handles remain in deterministic orchestration. Tests verify these input boundaries. Future provider prompts should continue to add only fields justified by the role.

### No Total Turn Or Spend Budget

Financial specialist timeouts are hard-coded to 10 seconds per call and run sequentially; Companion Voice has a separate five-second timeout. There is no total turn deadline, per-role model selection, token/output budget, retry policy, provider rate control, or per-turn cost limit. The configured `OPENAI_MODEL` is global and only `mock` is currently runnable.

### Specialist Handoffs Use Strict Version 1 Schemas

Financial Moment, Savings Reasoning, and Companion Voice handoffs now carry schema version 1 and use strict Zod schemas for inputs and outputs. Unknown fields and unsupported versions are rejected before output enters policy-sensitive orchestration. The underlying model adapter and any future provider-specific payload still need their own bounded serialization contract.

### State And Traces Are Process-Local

Pending proposals and approvals live in `VictoriaAgent` maps, and trace history is an in-memory ring buffer. Neither survives instance replacement or coordinates multiple instances. Production turn admission, durable conversation state, approval state, and audit traces need separate persistence and concurrency design before deployment.

## Recommended Development Order

These are proposed implementation slices; none enables a live provider:

1. **Propagate cancellation:** add optional abort signals through `LlmAdapter` and read-only estimation tool contracts; prove timed-out calls stop or their late results are ignored.
2. **Minimize model context:** implemented in the 2026-10-04 specialist context minimization session.
3. **Version strict schemas:** implemented in the 2026-10-05 versioned specialist schemas session.
4. **Add budgets and disabled-by-default gates:** define per-role model settings, total turn deadline, call/token/cost limits, and an explicit live-specialist flag that remains off by default.
5. **Design durable turn and trace state:** make pending actions and audit records safe across process restarts and concurrent instances before production deployment.

Live specialist use remains blocked until total turn/cost budgets, durable state, adapter cancellation verification, and separate authorization are complete. Real money movement remains outside this path and prohibited throughout the MVP.
