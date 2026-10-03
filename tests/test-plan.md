# Victoria TDD Test Plan

This file captures the first behaviors that should become tests as Victoria is implemented.

Normative safety rules and their stable identifiers live in `docs/specification/mvp-safety-contract.md`. New behavior tests should include the applicable rule IDs so product decisions remain traceable to executable coverage.

## Agent Behavior

- Victoria classifies "I cooked instead of DoorDashing" as an avoided-spend event.
- Victoria classifies "I regret ordering takeout last night" as a regretful-spend reflection.
- Regretful spending stays reflective even when it includes a dollar amount; it creates no savings event, proposal, suggestion, tool call, or ledger entry.
- Victoria classifies "Put this toward my emergency fund" as a goal-allocation request.
- Victoria asks a follow-up question when a user says "I saved money today" without enough context.
- A vague savings message creates no event, proposal, suggestion, tool call, or ledger entry; after the user provides context, the agent can make an approval-gated suggestion.
- Victoria chooses `estimateAvoidedSpend()` before suggesting a savings action.
- Victoria refuses to call `eventuallyMoveMoney()` during the MVP, even when approval is present.

## Environment Safety

- Victoria parses a valid local environment.
- Victoria parses a valid test environment.
- Victoria blocks real money movement in every environment during the MVP.
- Victoria blocks production Plaid configuration outside production.
- Victoria requires a database URL.
- Victoria marks production and test modes clearly.
- Victoria derives feature flags from environment settings.
- Victoria keeps real transfers disabled in production during the MVP.

## Application Composition

- Victoria creates a mock-backed agent in the skeleton environment.
- Victoria refuses to pretend real AI is wired before an adapter exists.
- Victoria refuses to pretend real money movement is wired before an adapter exists.
- Victoria chooses dependencies from feature flags rather than raw environment variables.

## Savings Estimation

- Victoria uses a known merchant habit when a typical spend exists.
- Victoria uses user-provided amount when the user names a specific amount.
- Victoria falls back to asking a question when neither history nor amount exists.
- When an avoided-spend event is clear but its amount is unknown, Victoria asks for the amount and can use the user's answer in an approval-gated suggestion linked to the same event.
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
- Victoria preserves historical events, suggestions, approvals, and ledger entries instead of mutating them.
- Victoria represents a correction or reversal as a new record linked to the original.

## Memory Behavior

- Victoria remembers recurring merchants.
- Victoria updates a habit after repeated similar decisions.
- Victoria retrieves relevant goals before suggesting where savings should go.
- Victoria stores conversation context needed for follow-up questions.
- Victoria avoids using stale or unrelated memory for a new decision.
- Victoria can use updated memory for a future suggestion without rewriting an earlier suggestion.

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
- Victoria binds approval to the exact pending action and user.
- Victoria prevents an approval from being replayed after the action completes.
- Victoria can cancel or decline a pending savings suggestion.
- A clear decline marks its pending proposal declined, clears the pending action, and creates no ledger entry.
- Victoria makes it clear when an action is only a mocked ledger entry.

## Agentic Coding Setup

- `npm run agent:validate` fails when required agent instructions, task briefs, workflows, PR templates, or CODEOWNERS files are missing.
- `npm run agent:validate` fails when MVP-facing docs drift back toward real money movement language.
- The AI review script skips cleanly when optional and `OPENAI_API_KEY` is missing.
- The AI review script fails when `AI_REVIEW_REQUIRED=true` and `OPENAI_API_KEY` is missing.
- Pull-request AI review runs trusted default-branch code and never executes pull-request code with secrets.
- AI review keeps trusted instructions separate from untrusted diff content.
- Oversized diffs list every changed path, prioritize safety-sensitive excerpts, and cannot satisfy required AI review.

## Future Integration Boundaries

- Plaid transaction imports normalize merchant names consistently.
- Banking transfer requests are idempotent.
- Failed transfer attempts do not create completed savings entries.
- Notification scheduling respects user preferences.
- Agent tool calls are logged for auditability.
