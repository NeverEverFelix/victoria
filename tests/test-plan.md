# Victoria TDD Test Plan

This file captures the first behaviors that should become tests as Victoria is implemented.

## Agent Behavior

- Victoria classifies "I cooked instead of DoorDashing" as an avoided-spend event.
- Victoria classifies "I regret ordering takeout last night" as a regretful-spend reflection.
- Victoria classifies "Put this toward my emergency fund" as a goal-allocation request.
- Victoria asks a follow-up question when a user says "I saved money today" without enough context.
- Victoria chooses `estimateAvoidedSpend()` before suggesting a savings action.
- Victoria refuses to call `eventuallyMoveMoney()` without explicit user approval.

## Environment Safety

- Victoria parses a valid local environment.
- Victoria parses a valid test environment.
- Victoria blocks real money movement outside production.
- Victoria blocks production Plaid configuration outside production.
- Victoria requires a database URL.
- Victoria marks production and test modes clearly.
- Victoria derives feature flags from environment settings.
- Victoria allows real transfers only for production real-transfer configuration.

## Application Composition

- Victoria creates a mock-backed agent in the skeleton environment.
- Victoria refuses to pretend real AI is wired before an adapter exists.
- Victoria refuses to pretend real money movement is wired before an adapter exists.
- Victoria chooses dependencies from feature flags rather than raw environment variables.

## Savings Estimation

- Victoria uses a known merchant habit when a typical spend exists.
- Victoria uses user-provided amount when the user names a specific amount.
- Victoria falls back to asking a question when neither history nor amount exists.
- Victoria rounds and formats suggested savings amounts consistently.
- Victoria does not overstate monthly savings totals.

## Money Domain

- Victoria formats cents as US dollars.
- Victoria converts dollar inputs to cents.
- Victoria rejects invalid dollar amounts.
- Victoria sums completed savings entries only.
- Victoria calculates potential monthly savings from repeated choices.

## Ledger Behavior

- Victoria creates a pending savings suggestion before confirmation.
- Victoria creates a savings ledger entry only after confirmation.
- Victoria records the reason for the saved amount.
- Victoria can summarize weekly and monthly savings totals.
- Victoria keeps mocked ledger entries separate from real transfer state.

## Memory Behavior

- Victoria remembers recurring merchants.
- Victoria updates a habit after repeated similar decisions.
- Victoria retrieves relevant goals before suggesting where savings should go.
- Victoria stores conversation context needed for follow-up questions.
- Victoria avoids using stale or unrelated memory for a new decision.

## Conversation Quality

- Victoria responds with encouragement for avoided-spend events.
- Victoria responds without shame for regretful-spend events.
- Victoria explains the proposed savings action in plain language.
- Victoria asks for confirmation before creating a savings entry.
- Victoria gives the user a clear sense of progress after saving.

## Safety And Approval

- Victoria does not perform irreversible actions from a single ambiguous message.
- Victoria treats real money movement as a separate approved action.
- Victoria records an approval timestamp and source when the user confirms.
- Victoria can cancel or decline a pending savings suggestion.
- Victoria makes it clear when an action is only a mocked ledger entry.

## Future Integration Boundaries

- Plaid transaction imports normalize merchant names consistently.
- Banking transfer requests are idempotent.
- Failed transfer attempts do not create completed savings entries.
- Notification scheduling respects user preferences.
- Agent tool calls are logged for auditability.
