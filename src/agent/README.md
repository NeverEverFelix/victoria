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

The first implementation should use mock tools and deterministic tests. OpenAI, Prisma, Plaid, and real transfer APIs should be plugged in behind these interfaces later.

`VictoriaAgent` can use an injected Financial Moment, Savings Reasoning, and Companion Voice team. `createVictoriaAgent` currently wires deterministic mock specialists for headless product development. Specialist classifications and assessments are validated; a suggestion must still match the deterministic tool estimate. Victoria's core agent retains proposal creation, explicit approval, ledger writes, goal handling, and transfer refusal. Progress, goal, and correction flows skip unrelated savings and voice specialists.

`team-prototype.ts` remains a standalone orchestration and evaluation seam with timing instrumentation. `team-assessment-policy.ts` validates financial evidence, and `team-response-policy.ts` restores disclosures and rejects completed-action claims, shaming language, and unsupported amounts. The Financial Moment role has an opt-in OpenAI Responses adapter with strict structured output; provider-backed Savings Reasoning and Companion Voice are not wired. The provider path remains disabled unless `OPENAI_FINANCIAL_MOMENT_ENABLED=true`, and scripted evaluations do not establish model quality or production readiness.
