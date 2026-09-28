# Agent Instructions For Victoria

Victoria is an agentic financial companion that helps people turn everyday restraint into recorded savings.

This repository is early-stage. Work carefully, preserve the product boundaries, and prefer small behavior-driven changes over broad rewrites.

## Start Here

Before making code changes, read:

1. `README.md`
2. `docs/mvp.md`
3. `docs/user-stories.md`
4. `tests/test-plan.md`
5. `docs/agentic-coding-patterns.md`
6. The relevant files under `src/`

Use these documents as the product contract. If they conflict, prefer the narrower and safer behavior from `docs/mvp.md` and `docs/user-stories.md`.

For reusable agent roles and handoff templates, see `.agents/README.md`.

## Current Product Boundary

Victoria's MVP is a mocked savings ledger, not a banking product.

Victoria may:

- Classify financial moments from natural language.
- Estimate avoided spending.
- Ask follow-up questions.
- Suggest recording savings.
- Create mocked ledger entries after confirmation.
- Summarize mocked savings progress.

Victoria must not:

- Move real money.
- Claim a mocked ledger entry is a bank transfer.
- Add Plaid production behavior.
- Add real transfer behavior.
- Treat ambiguous user messages as approval.
- Shame the user for spending.

Any future real money movement must be behind explicit user approval, production-safe configuration, and separate audited tool boundaries.

## Coding Approach

Prefer test-driven development.

Recommended loop:

1. Pick one story from `docs/user-stories.md`.
2. Find the closest behavior in `tests/test-plan.md`.
3. Write or update the smallest failing test.
4. Implement only the code needed to pass it.
5. Refactor only when the behavior stays clear and tested.
6. Run `npm run check`.

Keep changes small and aligned with the existing architecture.

## Architecture Boundaries

Use the existing folders intentionally:

- `src/agent/`: agent orchestration, policy, message classification contracts, tool calls, memory contracts, and model adapter contracts.
- `src/domain/`: pure business rules such as money formatting, parsing, totals, and other deterministic calculations.
- `src/config/`: environment parsing, feature flags, and safety gates.
- `src/app/`: application composition and dependency wiring.
- `tests/`: behavior-first coverage for agent, domain, config, app composition, and future integrations.

Do not wire external providers directly into the agent. Add adapters behind existing interfaces.

## Safety Rules

Money-related behavior must be conservative.

- Ask for clarification when the amount, merchant, or intent is unclear.
- Ask for confirmation before creating a savings ledger entry.
- Require explicit approval before any tool call that records or moves money.
- Keep mocked ledger entries separate from real transfer state.
- Never represent estimated savings as guaranteed savings.
- Never represent mocked savings as moved money.
- Never enable production banking behavior by default.

If a user asks Victoria to move money during the MVP, Victoria should explain that it can only record savings in the ledger for now.

## Tone Rules

Victoria should sound:

- Encouraging.
- Clear.
- Practical.
- Calm.
- Nonjudgmental.
- Honest about limitations.

Victoria should not sound:

- Shaming.
- Overly celebratory.
- Financially paternalistic.
- Vague about whether money moved.
- Certain about estimates when the data is thin.

## Implementation Priorities

The first implementation slices should follow this order:

1. Avoided spend with user-provided amount.
2. Vague savings moment.
3. Confirm suggested savings.
4. Avoided spend without known amount.
5. Regretful spend.

After those are solid, consider weekly progress, goal allocation, memory, and richer summaries.

## Testing Expectations

Run the full check before considering work complete:

```bash
npm run check
```

Add or update tests when changing behavior.

Focus tests on:

- User-visible responses.
- Agent decisions.
- Approval-gated actions.
- Money formatting and cents arithmetic.
- Environment safety rules.
- Separation between mocked and real money movement.

Avoid tests that lock in incidental implementation details unless they protect a safety boundary.

## Environment Expectations

Use example env files as documentation only. Do not commit real secrets.

Allowed committed files:

- `.env.example`
- `.env.test.example`
- `.env.staging.example`
- `.env.production.example`

Do not commit:

- `.env.local`
- `.env.test`
- `.env.staging`
- `.env.production`
- Real API keys or provider secrets.

## External Integrations

OpenAI, Plaid, Prisma, banking transfer providers, notifications, and production databases should be added only when the product boundary calls for them.

When adding one:

- Put it behind an existing interface or a narrowly scoped new interface.
- Preserve mock implementations for tests.
- Add configuration validation before use.
- Add tests for disabled, mocked, and unsafe states.
- Keep real money movement impossible unless explicitly approved and configured.

## Documentation Expectations

When product behavior changes, update the relevant docs:

- `docs/mvp.md` for MVP scope changes.
- `docs/user-stories.md` for behavior changes.
- `tests/test-plan.md` for new expected coverage.
- `docs/environments.md` for environment or safety rule changes.

Do not let code drift away from the product contract.
