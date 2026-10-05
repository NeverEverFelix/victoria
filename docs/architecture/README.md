# Victoria Architecture And System Design

This directory records Victoria's architecture diagrams, system-design decisions, and the tradeoffs behind them.

These documents describe how Victoria is intended to work. The narrower product and safety contracts in [`docs/mvp.md`](../mvp.md), [`docs/user-stories.md`](../user-stories.md), and [`docs/specification/mvp-safety-contract.md`](../specification/mvp-safety-contract.md) remain authoritative when there is a conflict.

## Structure

- [`diagrams/`](./diagrams/) contains version-controlled system diagrams with rendered SVG previews and Mermaid sources.
- [`decisions/`](./decisions/) contains numbered architecture decision records.

## Current Design

- [`Victoria Agentic Architecture`](./diagrams/victoria-agentic-architecture.md) shows the proposed orchestrated multi-agent system and its deterministic financial boundary.
- [`Victoria General System Design`](./diagrams/victoria-general-system-design.md) shows the proposed horizontally scaled modular monolith, durable turn admission, personalized memory flow, and external providers.
- [`ADR 0001`](./decisions/0001-orchestrated-multi-agent-architecture.md) records the proposed pattern, responsibilities, and tradeoffs.
- [`ADR 0002`](./decisions/0002-horizontally-scaled-modular-monolith.md) records the proposed Vercel and Neon deployment shape, capacity contract, cost rationale, and exit triggers.
- [`Specialist Runtime Readiness Review`](./specialist-runtime-readiness.md) records current blockers to live model use and the recommended disabled-by-default development sequence.

## Conventions

- Diagrams use Mermaid so they remain reviewable in pull requests.
- Decision records are append-only after acceptance. A later change should add a superseding decision rather than silently rewriting the old one.
- Proposed decisions must be labeled as proposals until the product decision is confirmed.
- Agent output is advisory until typed validation and deterministic policy checks succeed.
- No agent may bypass Victoria's approval, mocked-ledger, or immutable-history requirements.
