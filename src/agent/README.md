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
