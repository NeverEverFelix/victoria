# Victoria Test Suite

This directory defines the testing structure for Victoria before the application code exists.

The goal is to practice test-driven development by turning the product promise into executable expectations as each feature is built. Tests should describe behavior first, then implementation should be written only until the behavior passes.

## Testing Philosophy

Victoria handles money-related decisions, user trust, and agentic behavior. The test suite should therefore prioritize:

- User-visible behavior over implementation details.
- Safety around money movement and user approval.
- Deterministic agent behavior where possible.
- Clear boundaries between reasoning, tools, database writes, and external integrations.
- Fast unit tests for core logic and slower integration tests for full flows.

## Test Layers

```text
tests/
  unit/
    agent/
    app/
    config/
    domain/
    tools/
  integration/
    chat-flows/
    ledger/
    memory/
  e2e/
    user-journeys/
  contracts/
    ai/
    banking/
  fixtures/
    messages/
    transactions/
    users/
```

## What Belongs Where

- `unit/agent`: tests for message classification, intent detection, tool selection, and approval logic.
- `unit/app`: tests for composition, dependency wiring, and environment-based adapter selection.
- `unit/config`: tests for environment parsing, feature gates, and deployment safety rules.
- `unit/domain`: tests for pure business rules such as savings calculations and monthly totals.
- `unit/tools`: tests for individual tool behavior with mocked dependencies.
- `integration/chat-flows`: tests that cover multi-step Victoria conversations.
- `integration/ledger`: tests for creating, confirming, and summarizing savings entries.
- `integration/memory`: tests for remembering habits, merchants, goals, and prior decisions.
- `e2e/user-journeys`: browser-level tests for the main user flows once the app exists.
- `contracts/ai`: tests that define stable expectations for structured AI outputs.
- `contracts/banking`: tests for future banking provider boundaries such as Plaid or transfer APIs.
- `fixtures`: reusable sample users, messages, transactions, habits, goals, and expected outputs.

## Initial TDD Flow

1. Pick one behavior from `tests/test-plan.md`.
2. Write the smallest failing test for that behavior.
3. Implement only enough code to pass the test.
4. Refactor while keeping the test green.
5. Add integration coverage when multiple units need to work together.

## Non-Negotiable Safety Expectations

- Victoria must never move real money without explicit user confirmation.
- Victoria must be able to explain or expose why it suggested a savings amount.
- Victoria must ask a follow-up question when the amount or intent is unclear.
- Victoria must treat regretful spending without shame.
- Victoria must keep mocked ledger actions separate from real money movement.
