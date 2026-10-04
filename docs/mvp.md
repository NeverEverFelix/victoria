# Victoria MVP

This document defines the first version of Victoria before full application development begins.

The MVP should prove the behavioral loop: a person notices a small money decision, tells Victoria, confirms what they want to save, and sees that choice recorded somewhere meaningful.

The first version does not need real banking movement. It needs to make the saving behavior feel concrete, understandable, and trustworthy.

## MVP Goal

Victoria should help a user turn one small avoided purchase into a recorded savings action.

The MVP is successful if a user can:

- Tell Victoria about a small spending choice in natural language.
- Have Victoria understand the financial moment.
- Get a reasonable estimated amount, or be asked for the amount.
- Confirm whether they want to save it.
- See the saved amount recorded in a mocked ledger.
- Understand that no real money has moved yet.

## First User

The first user is someone who wants to save more money but does not want to manage a full budget.

They may:

- Have one checking account.
- Have inconsistent spending habits.
- Make frequent small purchases like takeout, coffee, rideshares, snacks, or impulse buys.
- Feel motivated by small wins.
- Need encouragement more than judgment.
- Want money to feel mentally separated before Victoria can physically move it.

The MVP should assume this user may not have multiple accounts, automatic transfers, or a perfectly organized financial life.

## Core Loop

The first product loop should be:

1. The user sends a message about a financial decision.
2. Victoria classifies the message.
3. Victoria estimates the amount saved, or asks a follow-up question.
4. Victoria proposes a savings action.
5. The user confirms or declines.
6. Victoria records a mocked savings ledger entry.
7. Victoria shows the user the impact.

Example:

```text
User:
I cooked instead of ordering takeout.

Victoria:
Nice. Your usual takeout order is around $27. Want to save that to your emergency fund?

User:
Yes.

Victoria:
Done. I recorded $27 in your savings ledger. You have saved $81 this week from choices like this.
```

## What Saving Means In The MVP

In the MVP, saving means creating a protected internal ledger entry.

It does not mean:

- Moving money between bank accounts.
- Initiating a bank transfer.
- Debiting a checking account.
- Guaranteeing the money is unavailable to spend.

This matters because early Victoria may support users with only one bank account. For those users, the first version should create a mental and visible separation before it creates a banking separation.

Victoria should say clearly when a saved amount is only recorded:

```text
I recorded this in your Victoria savings ledger. No real money has moved yet.
```

Later, Victoria can connect this ledger to real savings accounts, vaults, or transfers, but that is outside the MVP.

## First Scenarios

The MVP should support these scenarios first.

### Avoided Takeout

```text
I cooked instead of ordering DoorDash.
```

Expected behavior:

- Classify as avoided spend.
- Estimate from a known habit if available.
- Otherwise ask for the typical amount.
- Suggest recording the amount as saved.

### Coffee At Home

```text
I made coffee at home instead of going to Blue Bottle.
```

Expected behavior:

- Classify as avoided spend.
- Use a known merchant or category amount if available.
- Encourage the decision without overdoing it.
- Ask for confirmation before creating a ledger entry.

### Impulse Purchase Avoided

```text
I almost bought a $90 jacket but decided to wait.
```

Expected behavior:

- Use the user-provided amount.
- Treat the decision as a strong pause.
- Ask whether the user wants to record the $90 as saved.

### Regretful Spend

```text
I regret ordering takeout last night.
```

Expected behavior:

- Classify as regretful-spend reflection.
- Do not shame the user.
- Do not automatically create a savings action.
- Offer reflection, a future plan, or a reminder.

### Vague Savings Moment

```text
I saved money today.
```

Expected behavior:

- Classify as unclear.
- Ask a follow-up question.
- Do not guess an amount.
- Do not create a ledger entry yet.

## Required Behaviors

Victoria must:

- Use natural language as the primary input.
- Ask for clarification when the event or amount is unclear.
- Ask for confirmation before recording a savings entry.
- Explain whether the action is mocked or real.
- Keep the tone encouraging, practical, and nonjudgmental.
- Track weekly and monthly saved totals from mocked ledger entries.
- Allow memory and learned habits to evolve without rewriting historical events, suggestions, approvals, or ledger entries.
- Keep each user's habits, goals, and remembered decisions separate from other users' context.
- Correct a completed mocked-ledger amount only through a newly approved adjustment linked to the original entry.
- Use the corrected effective amount when allocating a corrected entry to a goal.

Victoria must not:

- Move real money.
- Claim money was transferred when it was only recorded.
- Treat ambiguous messages as approval.
- Shame the user for spending.
- Overstate progress or savings totals.
- Recommend risky financial behavior.

## MVP Data Concepts

The MVP should eventually store:

- User messages.
- Classified financial events.
- Pending savings suggestions.
- Confirmed savings ledger entries.
- Saved amount in cents.
- Reason for the saved amount.
- Optional goal destination.
- Created timestamp.
- Whether the entry is mocked or real.

For now, these can be represented through in-memory mocks and test fixtures.

Victoria's memory evolves, but historical events, suggestions, approvals, and ledger entries remain immutable. A later correction, revised estimate, or newly learned habit must create a new linked record instead of changing what Victoria previously observed, suggested, approved, or recorded.

## Out Of Scope

The MVP should not include:

- Real bank transfers.
- Plaid production access.
- Automatic transaction import.
- Credit card payoff automation.
- Investment recommendations.
- Debt payoff optimization.
- Full budgeting categories.
- Subscription cancellation.
- Multi-user household finances.
- Tax advice.

These may become useful later, but they should not distract from proving the core behavior first.

## Product Questions

Open questions to resolve before deeper development:

- If the user has one bank account, what should make saved money feel protected?
- Should Victoria support goals from day one, or start with a generic savings ledger?
- Should users be able to edit or delete a saved entry?
- How should Victoria handle a user who confirms a saved amount but later spends the money anyway?
- Should regretful spending create a future reminder, a reflection note, or both?
- What language makes mocked savings feel honest without feeling weak?

## Development Readiness

Victoria is ready for deeper development when these decisions are clear:

- The first user profile is accepted.
- The mocked ledger behavior is accepted.
- The first five scenarios are the behavioral contract.
- The product agrees that real money movement is not part of the MVP.
- The app can honestly communicate the difference between recorded savings and moved money.

Until then, the best work is product definition, scenario writing, and test planning.
