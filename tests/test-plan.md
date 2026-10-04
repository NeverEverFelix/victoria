# Victoria TDD Test Plan

This file captures the first behaviors that should become tests as Victoria is implemented.

Normative safety rules and their stable identifiers live in `docs/specification/mvp-safety-contract.md`. New behavior tests should include the applicable rule IDs so product decisions remain traceable to executable coverage.

## Agent Behavior

- Victoria classifies "I cooked instead of DoorDashing" as an avoided-spend event.
- Victoria classifies "I regret ordering takeout last night" as a regretful-spend reflection.
- Regretful spending stays reflective even when it includes a dollar amount; it creates no savings event, proposal, suggestion, tool call, or ledger entry.
- Victoria classifies "Put this toward my emergency fund" as a goal-allocation request.
- With a pending savings suggestion, a goal allocation updates the proposed destination, binds approval to the updated action, and records the goal on the mocked ledger entry only after confirmation.
- Without a pending or recent saved amount, a goal allocation asks which amount the user means and makes no ledger change.
- Victoria asks a follow-up question when a user says "I saved money today" without enough context.
- A vague savings message creates no event, proposal, suggestion, tool call, or ledger entry; after the user provides context, the agent can make an approval-gated suggestion.
- Victoria chooses `estimateAvoidedSpend()` before suggesting a savings action.
- Victoria refuses to call `eventuallyMoveMoney()` during the MVP, even when approval is present.
- A natural-language real-transfer request receives a clear limitation response and does not create a mocked entry or call a transfer tool, including when a savings suggestion is pending.

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
- Victoria prefers a user-provided amount over merchant history when both are present.
- Victoria falls back to asking a question when neither history nor amount exists.
- When an avoided-spend event is clear but its amount is unknown, Victoria asks for the amount and can use the user's answer in an approval-gated suggestion linked to the same event.
- Victoria rounds and formats suggested savings amounts consistently.
- Victoria does not overstate monthly savings totals.

## Money Domain

- Victoria formats cents as US dollars.
- Victoria converts dollar inputs to cents.
- Victoria rejects invalid dollar amounts.
- The mocked ledger rejects zero, negative, fractional, non-finite, or unsafe integer cent amounts before storing an entry.
- Victoria sums completed savings entries only.
- Victoria calculates potential monthly savings from repeated choices.

## Ledger Behavior

- Victoria creates a pending savings suggestion before confirmation.
- Victoria creates a savings ledger entry only after confirmation.
- Victoria records the reason for the saved amount.
- Victoria can summarize weekly and monthly savings totals.
- A weekly progress question calls the read-only ledger summary tool, counts only completed entries for the current Monday-to-Monday UTC week, and clearly says the total is recorded in the mocked Victoria ledger.
- A future intention such as “I plan to save more this week” is not treated as a weekly progress question.
- A goal allocation for a recent confirmed entry requires a separate exact-action approval and creates an immutable linked record without changing the original entry.
- Retrying an identical approved goal allocation returns the existing allocation, while reusing its action ID for different allocation details is rejected.
- Victoria keeps mocked ledger entries separate from real transfer state.
- Victoria preserves historical events, suggestions, approvals, and ledger entries instead of mutating them.
- Returned event, suggestion, proposal, approval, correction, allocation, and entry snapshots cannot be mutated by callers; changing a habit only affects later suggestions.
- Habits, goals, and remembered decisions supplied for one user never appear in another user's memory or affect their merchant estimates.
- A goal allocation after a correction uses the entry's current effective amount, while preserving the original entry amount in history.
- Victoria represents a correction or reversal as a new record linked to the original.
- Correcting a recorded amount requires exact approval, appends a signed adjustment, and leaves the original entry unchanged.
- Corrections reject invalid, no-op, cross-user, non-completed, or non-mocked targets, and effective weekly totals retain the original entry's week.
- Model classifications and estimated suggestions are runtime-validated; malformed values and model-supplied approval fields cannot create proposals or ledger entries.
- If a save, correction, or goal allocation succeeds but its reply is lost, repeating the approval reuses the same approval record and returns the existing mocked result without duplicating history.
- Each recorded entry links to the same user, proposal, action, approval, and ledger entry shown in its proposal transition.
- Estimated amounts explain their basis briefly, such as the user's usual spend at a named merchant.
- Monetary conversions, formatting, totals, and calculated projections reject values or results outside safe integer cents.

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
- After recording a confirmed entry, Victoria includes the updated current-week mocked-ledger total; if that read-only summary fails, it still confirms the entry and explains that progress is temporarily unavailable.

## Safety And Approval

- Victoria does not perform irreversible actions from a single ambiguous message.
- Replies such as “okay,” “sure,” or “sounds good” to a pending savings or goal-allocation proposal ask for an explicit yes or no and create no record.
- Victoria treats real money movement as a separate approved action.
- Victoria records an approval timestamp and source when the user confirms.
- Victoria binds approval to the exact pending action and user.
- Victoria prevents an approval from being replayed after the action completes.
- Victoria can cancel or decline a pending savings suggestion.
- A clear decline marks its pending proposal declined, clears the pending action, and creates no ledger entry.
- Proposal approval, decline, and replacement create explicit transition records bound to the proposal, user, and action; terminal proposals cannot transition again.
- A clear decline such as “No, not today” also clears a pending goal allocation without recording an allocation.
- A failed ledger write does not produce success wording, leaves the approved action retryable, and a retry with the same user/action ID creates at most one entry even if the first response was lost after persistence.
- Changing a pending proposal's amount, reason, or goal creates a linked replacement proposal and requires fresh approval; unsupported currency edits leave the USD mock-ledger proposal unchanged.
- Approval from another user cannot approve a proposal, and goal allocation cannot reuse the prior proposal's approval.
- Explicit amounts with more than two decimal places or a recognized non-USD currency require clarification and create no proposal or ledger entry; an invalid correction cannot approve the prior pending amount.
- Explicit zero or negative USD amounts require clarification and create no proposal or ledger entry.
- Multiple explicit dollar amounts require clarification; pending proposal edits with multiple amounts cannot be approved until one amount is specified.
- Victoria makes it clear when an action is only a mocked ledger entry.

## Agentic Coding Setup

- The headless agent-team prototype routes a turn through typed Financial Moment, Savings Reasoning, and Companion Voice handoffs in order.
- Orchestration is separated from deterministic handoff validation and final response wording policy.
- Invalid moment output, specialist exceptions, or conflicting savings amounts resolve to a safe clarification/reflection and never to a financial mutation.
- Suggested user-provided amounts must match the validated finding; habit estimates must match the user's own USD habit record.
- The deterministic response policy restores mandatory confirmation, mocked-ledger, and no-transfer disclosures when voice output omits them or falsely claims an action completed.
- Habit-based savings wording remains explicitly estimated after companion voice drafting.
- The curated specialist readiness corpus preserves expected baseline and advisory-team outcomes for explicit amounts, known estimates, missing amounts, vague savings, regretful spend, transfer requests, and multiple amounts.
- The readiness harness calculates nearest-rank p50/p95 summaries across multiple turns and rejects invalid latency observations; mock timings are not treated as provider SLA evidence.
- The prototype records per-specialist and total elapsed time, the evaluation harness summarizes multi-turn p50/p95, and the orchestrator never invokes more than three specialists in a turn.

- `npm run agent:validate` fails when required agent instructions, task briefs, workflows, PR templates, or CODEOWNERS files are missing.
- `npm run agent:validate` fails when MVP-facing docs drift back toward real money movement language.
- The AI review script skips cleanly when optional and `OPENAI_API_KEY` is missing.
- The AI review script fails when `AI_REVIEW_REQUIRED=true` and `OPENAI_API_KEY` is missing.
- Pull-request AI review runs trusted default-branch code and never executes pull-request code with secrets.
- AI review keeps trusted instructions separate from untrusted diff content.
- Oversized diffs list every changed path, prioritize safety-sensitive excerpts, and cannot satisfy required AI review.
- AI review uses its configured per-pass output-token budget and rejects values outside the bounded range.
- Large AI review diffs are split into smaller bounded passes; every pass must complete before any review is posted.

## Future Integration Boundaries

- Plaid transaction imports normalize merchant names consistently.
- Banking transfer requests are idempotent.
- Failed transfer attempts do not create completed savings entries.
- Notification scheduling respects user preferences.
- Agent tool calls are logged for auditability.
