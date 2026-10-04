# Victoria User Stories

This document translates the MVP into concrete user stories.

These stories are intentionally small. Each one should be easy to turn into a test, a UI flow, or an agent behavior.

## Story 1: Avoided Spend With User-Provided Amount

As a user, I want to tell Victoria about a specific purchase I avoided so that I can record that exact amount as saved.

Example message:

```text
I almost bought a $90 jacket but decided to wait.
```

Victoria should:

- Classify the message as an avoided-spend event.
- Detect the user-provided amount of $90.
- Treat the decision as a positive pause.
- Ask whether the user wants to record $90 as saved.
- Wait for confirmation before creating a ledger entry.

Acceptance criteria:

- Given the message includes a clear dollar amount, Victoria uses that amount.
- Given the amount has more than two decimal places or uses a recognized non-USD currency, Victoria asks for a valid USD amount and creates no proposal.
- Given the user has not confirmed, no savings ledger entry is created.
- Given the user confirms, Victoria creates a mocked ledger entry for 9000 cents.
- Given the entry is mocked, Victoria does not claim real money moved.

## Story 2: Avoided Spend Without Known Amount

As a user, I want to tell Victoria I avoided a common purchase so that Victoria can help estimate what I saved.

Example message:

```text
I cooked instead of ordering DoorDash.
```

Victoria should:

- Classify the message as an avoided-spend event.
- Look for a known habit, merchant, or category amount.
- Use the known amount if one exists.
- Ask a follow-up question if no amount can be estimated.
- Ask for confirmation before recording savings.

Acceptance criteria:

- Given Victoria knows the user's typical DoorDash order, Victoria suggests that amount.
- Given Victoria does not know the typical amount, Victoria asks what the user usually spends.
- Given the user provides an amount, Victoria can propose a savings action.
- Given the user confirms, Victoria creates a mocked ledger entry.

## Story 3: Coffee At Home

As a user, I want Victoria to recognize small everyday wins so that saving feels achievable.

Example message:

```text
I made coffee at home instead of going to Blue Bottle.
```

Victoria should:

- Classify the message as an avoided-spend event.
- Identify coffee as a small recurring purchase.
- Estimate the saved amount from memory if possible.
- Keep the response encouraging and brief.
- Ask whether the user wants to record the amount as saved.

Acceptance criteria:

- Given Victoria has a known Blue Bottle amount, Victoria uses it.
- Given Victoria only knows a generic coffee amount, Victoria may use that estimate.
- Given Victoria has no relevant amount, Victoria asks for the typical spend.
- Given the user declines, no ledger entry is created.

## Story 4: Vague Savings Moment

As a user, I want to casually tell Victoria I saved money so that Victoria can help me clarify what happened.

Example message:

```text
I saved money today.
```

Victoria should:

- Classify the message as unclear.
- Avoid guessing a purchase, merchant, or amount.
- Ask a follow-up question.
- Avoid creating any ledger entry until the user gives enough detail and confirms.

Acceptance criteria:

- Given the message lacks a financial event, Victoria asks what the user avoided or changed.
- Given the message lacks an amount, Victoria does not invent one.
- Given the user later provides context, Victoria continues the same flow.
- Given there is no confirmation, no ledger entry is created.

## Story 5: Regretful Spend

As a user, I want to tell Victoria about spending I regret without being shamed.

Example message:

```text
I regret ordering takeout last night.
```

Victoria should:

- Classify the message as a regretful-spend reflection.
- Respond without guilt or judgment.
- Avoid treating the regretted spend as money saved.
- Offer a constructive next step, such as reflection, planning, or a reminder.

Acceptance criteria:

- Given the user describes regret, Victoria does not create a savings suggestion by default.
- Given the user wants help planning, Victoria can suggest a future alternative.
- Given the user asks to save an amount anyway, Victoria asks for explicit amount and confirmation.
- Given no confirmation exists, no ledger entry is created.

## Story 6: Confirm Suggested Savings

As a user, I want to confirm a savings suggestion so that Victoria records it in my mocked savings ledger.

Example flow:

```text
Victoria:
Want to record $27 as saved?

User:
Yes.
```

Victoria should:

- Recognize the user's confirmation.
- Create a mocked ledger entry for the pending suggestion.
- Show the saved amount.
- Show the updated current-week total from the mocked ledger when available.
- Still confirm the recorded amount if the progress summary cannot be loaded.
- Make it clear that no real money moved.

Acceptance criteria:

- Given there is a pending savings suggestion, a clear yes confirms it.
- Given there is no pending savings suggestion, a yes does not create a new entry.
- Given approval refers to another action or user, no entry is created.
- Given an approved action was already completed, replaying that approval creates no second entry.
- Given the entry is created, it includes amount, reason, timestamp, and mocked status.
- Given the event, suggestion, approval, and entry have been recorded, later learning does not rewrite them.
- Given a recorded amount needs correction, Victoria preserves the original history and creates a new linked correction record.
- Given the entry is created, Victoria returns a confirmation message.

## Story 7: Decline Suggested Savings

As a user, I want to decline a savings suggestion without friction.

Example flow:

```text
Victoria:
Want to record $27 as saved?

User:
Not today.
```

Victoria should:

- Recognize the user's decline.
- Avoid creating a ledger entry.
- Keep the response respectful and lightweight.
- Leave room for the user to continue the conversation.

Acceptance criteria:

- Given there is a pending savings suggestion, a clear decline cancels it.
- Given the user declines, no ledger entry is created.
- Given the user declines, Victoria does not pressure the user.

## Story 8: Weekly Progress

As a user, I want to see how small choices add up so that the behavior feels worthwhile.

Example message:

```text
How much have I saved this week?
```

Victoria should:

- Summarize confirmed mocked ledger entries for the current week.
- Exclude pending, declined, or canceled suggestions.
- Format the total clearly.
- Avoid overstating the impact.

Acceptance criteria:

- Given three confirmed mocked entries this week, Victoria sums them.
- Given entries from a previous week exist, Victoria excludes them from the weekly total.
- Given no entries exist this week, Victoria says so plainly.
- Given all entries are mocked, Victoria does not imply real money moved.

## Story 9: Goal Allocation

As a user, I want to tell Victoria where a saved amount should go so that the ledger reflects my priorities.

Example message:

```text
Put this toward my emergency fund.
```

Victoria should:

- Recognize the message as a goal-allocation request.
- Apply it to a pending suggestion or a clearly identified recent confirmed entry.
- Ask a follow-up question when context is unclear.
- Avoid moving real money.

Acceptance criteria:

- Given there is a pending savings suggestion, Victoria can attach the emergency fund goal to it.
- Given there is no clear pending or recent saved amount, Victoria asks what amount the user means.
- Given the user confirms an allocation for a completed entry, Victoria creates a separate immutable goal-allocation record linked to that entry.
- Given a goal allocation is recorded, the original savings entry remains unchanged.
- Given the goal is recorded, Victoria still makes clear that no real money moved.

## Story 10: No Real Money Movement

As a user, I want Victoria to be honest about what it can and cannot do so that I can trust it with financial decisions.

Example message:

```text
Move the money now.
```

Victoria should:

- Refuse or redirect real money movement in the MVP.
- Explain that the current version can record savings only.
- Offer to create or update a mocked ledger entry instead.
- Never call a real banking transfer tool.

Acceptance criteria:

- Given the MVP uses mocked money movement, Victoria does not claim to move funds.
- Given the user asks for a real transfer, Victoria explains the limitation.
- Given the user wants to record the amount, Victoria can continue with the mocked ledger flow.
- Given any real transfer tool exists later, Victoria still requires explicit approval and production-safe configuration.

## Priority Order

## Story 11: Correct A Recorded Savings Amount

As a user, I want to correct an amount Victoria recorded so the ledger reflects updated information without losing the original history.

Example:

```text
Victoria: I recorded $27 in your Victoria savings ledger.
User: Correct that recorded entry to $24.
Victoria: I can reduce the recorded amount by $3, making the corrected total $24. The original entry will stay in the history. Please confirm this correction.
```

Acceptance criteria:

- A correction targets a completed mocked entry belonging to the user.
- Victoria asks for explicit approval before recording the correction.
- Approval appends a signed adjustment linked to the original entry; the original remains unchanged.
- Effective weekly totals use the corrected amount while retaining the original entry's reporting week.
- If the target entry is unclear, Victoria asks which entry and makes no change.

The first implementation should focus on:

1. Avoided spend with user-provided amount.
2. Vague savings moment.
3. Confirm suggested savings.
4. Avoided spend without known amount.
5. Regretful spend.

This order proves the core safety and conversation loop before adding richer memory, progress summaries, or goals.
