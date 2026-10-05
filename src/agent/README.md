# Victoria Agent

This module contains the skeleton for Victoria's agentic AI layer.

The agent is responsible for turning a user message into a safe, useful financial workflow:

1. Understand the user's message.
2. Classify the financial moment.
3. Retrieve relevant memory.
4. Estimate the amount involved.
5. Decide whether to ask, suggest, save, reflect, or refuse.
6. Call tools only when the action is allowed.
7. Return a response the user can trust.

The agent should be proactive with reasoning, memory, suggestions, and reminders. It must not move real money during the MVP, even with explicit user approval.

## Boundaries

- `victoria-agent.ts`: orchestration loop.
- `types.ts`: shared agent types and contracts.
- `policy.ts`: safety rules for tool use and money movement.
- `llm/`: model adapter interfaces.
- `memory/`: memory provider interfaces.
- `tools/`: tool contracts and mock implementations.
- `prompts/`: system instructions for Victoria's tone and behavior.
- `specialists/coordinator.ts`: typed advisory specialist interfaces and fail-closed reconciliation rules for the staged multi-agent path.
- `specialists/mock-specialists.ts`: mock moment and savings reasoning specialists used by headless application composition.
- `specialists/companion-voice.ts`: verified response handoff and output checks for the Companion Voice role.
- `specialists/tracing.ts`: metadata-only specialist trace schema, safe sink wrapper, and bounded in-memory sink.

`VictoriaAgent` routes first-pass classification and savings reasoning through required specialist interfaces, then sends a minimal verified outcome and permitted response goal to the Companion Voice role. Specialist handoffs use strict version 1 schemas and reject unknown fields. Cancellation signals flow through the specialist interfaces to model and read-only estimation adapters. Specialist exceptions, invalid outputs, timeouts, and material amount disagreement return clarification without a proposal or tool call. Voice drafts that alter amounts, omit required disclosures or estimate provenance, claim money moved, or use shaming language fall back to deterministic wording. The coordinator does not authorize actions or write financial records. Application composition remains mock-backed; live provider wiring remains disabled.

Each agent instance retains up to 1,000 metadata-only specialist traces for local diagnostics. Traces contain role, schema version, correlation ID, status, timestamps, and duration; they do not contain raw user input, specialist output, or hidden reasoning. No durable trace store is configured.

The first implementation should use mock tools and deterministic tests. OpenAI, Prisma, Plaid, and real transfer APIs should be plugged in behind these interfaces later.
