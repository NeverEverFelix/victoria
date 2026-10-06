# Victoria

Victoria is an agentic financial companion that helps people turn everyday restraint into recorded savings.

Most budgeting tools show you where your money went after it is already gone. Victoria is different: it meets you in the moment, understands the small financial decisions you are making, and helps you record the money you almost spent before it quietly disappears into the rest of your balance.

The goal of Victoria is simple: help people actually save money.

## The Idea

Victoria lives with you throughout your day as a conversational financial companion. When you make, avoid, or regret a small financial decision, you can tell Victoria in natural language.

For example:

> "Hey Victoria, instead of DoorDashing my usual 7th Street order, I cooked at home."

Victoria should understand the decision, estimate the amount you avoided spending, and ask whether you want to save it:

> "Great job. Your typical 7th Street order is about $27.46. Would you like me to record that in your Victoria savings ledger? No real money has moved yet."

Victoria is designed around the belief that saving money should not depend only on strict budgets, guilt, or perfect discipline. It should also capture the tiny wins people already have: cooking instead of ordering food, making coffee at home, skipping an impulse purchase, choosing a cheaper ride, waiting before buying something, or deciding not to go out.

## What Victoria Does

Victoria helps users:

- Recognize small money-saving decisions as they happen.
- Estimate the value of the purchase they avoided.
- Record that amount in a mocked savings ledger.
- Track how those small decisions add up over time.
- Build a healthier relationship with money through encouragement, reflection, and consistent nudges.

Victoria should feel less like a spreadsheet and more like a trusted companion who knows your habits, remembers your goals, and helps you act on your better financial instincts.

## Core Product Loop

1. The user tells Victoria about a financial decision.
2. Victoria interprets the decision and identifies the avoided or regretted spend.
3. Victoria estimates the typical cost using transaction history, known habits, or user-provided context.
4. Victoria asks for confirmation before recording savings.
5. Victoria records the amount in a mocked savings ledger.
6. Victoria shows the user the impact over time.

## Bare Bones Machinery

Victoria should be built as an agentic product from the beginning. The first version does not need complex banking infrastructure, but it should have the right shape: a conversational app, a memory layer, an agent layer, and a small set of tools Victoria can use to help the user act.

Recommended starting stack:

- TypeScript for the application language.
- Next.js for the web app, chat interface, dashboard, and API routes.
- Postgres for persistent memory.
- Prisma for modeling and querying the database from TypeScript.
- OpenAI for natural language understanding, reasoning, and agent behavior.
- A mocked savings ledger before any real money movement.
- Plaid or similar banking integrations later, after the core behavior is proven.

The first version should prove the behavioral loop before it tries to become a bank. Victoria can begin by recording saved amounts in an internal ledger, showing progress, and building trust. Real transfers should come later and should always require explicit user approval.

## Developer Setup

Install dependencies, create a local environment file, then run the project checks:

```bash
npm install
cp .env.example .env.local
npm run check
```

Only commit `.env*.example` files. Keep real `.env.local`, `.env.test`, `.env.staging`, and `.env.production` files uncommitted.

## Agentic Coding Setup

Victoria is set up for agent-assisted development before full product development begins.

Start with:

- `AGENTS.md` for repository-level coding instructions.
- `.agents/README.md` for reusable orchestrator, reviewer, and handoff prompts.
- `docs/agentic-coding-patterns.md` for the coding-agent workflow.
- `docs/agent-work-queue.md` for prioritized implementation slices.
- `docs/architecture/README.md` for system diagrams, architecture decisions, and tradeoffs.
- `docs/decisions.md` for product decisions and unresolved questions.
- `docs/failure-modes.md` for Victoria-specific silent failures to guard against.
- `docs/specification/mvp-safety-contract.md` for normative safety rules, decision tables, and test traceability.
- `docs/mvp.md` and `docs/user-stories.md` for the MVP behavior contract.

The default coding pattern is one orchestrator agent working on one slice at a time. Specialist reviewers should be used only for risky or cross-cutting changes, especially around tests, safety, architecture, and documentation drift.

GitHub Actions includes an AI code review workflow for pull requests and every branch push. Pull requests are reviewed by a trusted script checked out at the PR's base commit; product rules are loaded from that same commit, while proposed changes are downloaded only as untrusted diff data and are never executed with the OpenAI secret. The complete diff is reviewed in bounded passes, with explicit coverage reported. Up to five passes run concurrently; GPT-5 uses low reasoning effort so internal reasoning leaves the response budget for findings. Add an `OPENAI_API_KEY` repository secret to enable reviews. You can optionally set `OPENAI_CODE_REVIEW_MODEL`; otherwise the workflow uses `gpt-5`. Existing bounds remain configurable: `AI_REVIEW_MAX_DIFF_CHARS` (default 18,000), `AI_REVIEW_MAX_OUTPUT_TOKENS` (default 2,000), `AI_REVIEW_MAX_CHUNKS` (default 24), and `AI_REVIEW_MAX_COMMENT_CHARS`. Without the secret, the workflow skips AI review and leaves a job summary.

See `docs/github-setup.md` for recommended branch protection, labels, and GitHub repository settings.

## Agentic Architecture

Victoria is not just a chat window. Victoria should be able to reason about a user's financial behavior, remember context, choose tools, ask follow-up questions, and take approved actions.

At a high level:

```text
Next.js App
  Chat interface
  Savings dashboard
  Goal view
  Notification surface

Victoria Agent
  Understands user messages
  Classifies financial moments
  Retrieves relevant memory
  Estimates avoided spend
  Decides whether to ask, suggest, save, or reflect
  Calls tools after user approval

Tool Layer
  getUserHabits()
  findTypicalMerchantSpend()
  estimateAvoidedSpend()
  createSavingsEntry()
  getWeeklySavingsTotal()
  createSavingsGoalAllocation()

Database
  Users
  Messages
  Financial decisions
  Merchants
  Habits
  Savings entries
  Goals
  Agent memories
  Scheduled nudges

Integrations
  OpenAI
  Plaid later
  Banking or payment movement later
  Push, SMS, or email notifications later
```

The agent should be able to handle messages like:

- Avoided spend: "I cooked instead of ordering takeout."
- Regretful spend: "I should not have bought lunch out today."
- Goal update: "Put this toward my emergency fund."
- Pattern reflection: "I keep ordering food when I am tired."
- Unclear input: "I saved money today, I think."

For the MVP, the Victoria agent can follow a simple loop:

1. Receive a user message.
2. Classify the financial event.
3. Retrieve any relevant habits, merchants, goals, or previous decisions.
4. Estimate the amount involved.
5. Ask for clarification if needed.
6. Suggest a savings action.
7. Wait for user approval.
8. Create a ledger entry or update a goal.
9. Show the user the impact.

The key rule for the MVP: Victoria can be proactive with insight, memory, reminders, and suggestions, but it cannot move real money.

## Testing Strategy

Victoria should be developed with test-driven development. The test suite should begin as a behavioral contract for the product, then become executable as the app is implemented.

The test structure lives in `tests/` and is organized around:

- Unit tests for agent decisions, domain rules, and tools.
- Integration tests for chat flows, memory, and the savings ledger.
- End-to-end tests for complete user journeys.
- Contract tests for AI outputs and future banking integrations.
- Fixtures for messages, transactions, users, habits, and goals.

Start with `tests/test-plan.md` when choosing the next behavior to implement.

## Current Agent Skeleton

The initial agentic AI skeleton lives in `src/agent/`. It defines the core boundaries Victoria will need before the full app exists:

- `victoria-agent.ts`: the main agent orchestration loop.
- `types.ts`: shared message, decision, savings, and tool-call contracts.
- `policy.ts`: safety checks for approval-gated actions.
- `llm/`: the interface for future OpenAI-backed reasoning.
- `memory/`: the interface for future Prisma/Postgres-backed memory.
- `tools/`: tool contracts and mock tools for savings estimation and ledger entries.
- `prompts/`: Victoria's system-level behavioral instructions.

The skeleton is intentionally dependency-light. The next step is to write failing unit tests around the agent loop, then implement the first deterministic behaviors.

## Environments

Victoria should run with separate local, test, staging, and production environments. Each environment should have its own database, secrets, AI keys, and banking configuration.

See `docs/environments.md` for the environment matrix, required variables, and money movement safety rules. Start from `.env.example` for local development, `.env.test.example` for test runs, `.env.staging.example` for staging, and `.env.production.example` for production.

The config parser lives in `src/config/env.ts`. It validates required variables, enforces compatible `APP_ENV` and `NODE_ENV` pairs, keeps environment database names separated, rejects unsafe production secrets, and prevents real money movement or production Plaid settings outside the approved production path. Feature flags derived from that config live in `src/config/feature-flags.ts`.

The agent composition entry point lives in `src/app/create-victoria-agent.ts`. Mock AI, memory, and ledger tools remain the default. Set `OPENAI_AGENT_TEAM_ENABLED=true` to opt into provider-backed Financial Moment, Savings Reasoning, and Companion Voice specialists. For the single provider Financial Moment adapter, set `OPENAI_FINANCIAL_MOMENT_ENABLED=true`; it is used only when the full-team flag is false. Both flags default off, and `OPENAI_MODEL=mock` always keeps AI mocked. Provider outputs remain advisory; deterministic core validation and approval govern every mocked-ledger write, and real money movement remains unavailable.

## Example Interactions

```text
User:
I almost bought a $90 jacket but decided to wait.

Victoria:
That is a strong pause. Want me to record the $90 in your Victoria savings ledger? No real money has moved yet.
```

```text
User:
I made coffee at home instead of going to Blue Bottle.

Victoria:
Nice. Your usual Blue Bottle spend is around $6.75. Want to save that today?
```

```text
User:
I regret ordering takeout last night.

Victoria:
No shame. Want to look at what triggered it and set up a small plan for next time?
```

## Product Principles

- Conversational first: users should be able to talk to Victoria naturally, like they would talk to an assistant.
- Action-oriented: Victoria should not only give advice; it should help users take concrete financial action.
- Behavioral, not judgmental: Victoria should encourage better decisions without shame or guilt.
- Everywhere: Victoria should be available wherever financial decisions happen.
- Protective by default: money saved through Victoria should feel meaningfully separate from money available to spend.
- Transparent: users should always understand why Victoria suggested an amount and approve any movement of money.
- Auditable over time: Victoria's memory may evolve, but historical events, suggestions, approvals, and ledger entries remain immutable.

## Long-Term Vision

Victoria should become a financial companion that understands a user's spending patterns, goals, temptations, and wins. Over time, Victoria should be able to:

- Learn recurring merchants, categories, and habits.
- Detect possible savings moments automatically.
- Suggest savings amounts based on real transaction behavior.
- Maintain monthly and goal-based savings progress.
- Help users reflect on regrets without spiraling into shame.
- Integrate with banking, payments, budgeting, and messaging surfaces.
- Support goals like emergency funds, trips, debt payoff, investing, and rent buffers.

## What We Are Building Toward

Victoria is not just a budget tracker. It is a behavioral finance layer that sits between intention and action.

The product should help answer one question again and again:

> "You chose not to spend this money. Do you want to make that choice real?"
