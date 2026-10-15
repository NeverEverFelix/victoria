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

When explicitly injected, the SQLite context adapter keeps up to 20 user and Victoria messages for 30 minutes and queues a PostgreSQL backup. `MemoryOrchestrator` now sits above the SQLite/PostgreSQL adapters: it versions changed learned facts, filters stale or superseded profile memories, applies per-turn memory bounds, routes profile refreshes into durable semantic memory, and invalidates the short-lived SQLite cache after profile writes. The default application composition still uses mock memory; no Supabase project or provider credentials are configured. Durable conversational memories store user-scoped preferences, recurring habits, stated goals, and transaction-derived financial patterns as structured facts with evidence, confidence, source, and optional observation window. Migration `0004_semantic_user_memory.sql` adds versioned pgvector embeddings, HNSW cosine search, Supabase row-level security, and a bounded semantic search function. The optional persistent runtime composes PostgreSQL/Supabase memory and a concrete OpenAI embedding adapter; semantic retrieval falls back to recent persisted facts when embeddings are unavailable. An optional local-only provider path can extract stable ordinary context from an explicit user turn and summarize a bounded episode before short-term context rolls over. It is disabled by default and rejects sensitive, temporary, unsupported, quoted, negated, hypothetical, and third-party content. A validated episode may shape a later ordinary reply only when it is no more than 90 days old, not future-dated, and clearly matches the current topic; episodes do not affect financial decisions. On ordinary financial reflections, relevant retrieved user-stated preferences and goals can shape Victoria's response across conversations. A matching remembered coffee, takeout, or named-merchant routine can also provide supportive context without implying a spend amount; neither kind of personalization changes financial decisions or approval requirements. Recurring actions linked to a named merchant have merchant-specific memory keys, separate from category routines; when a matching routine exists but typical spend is unknown, Victoria first checks available transaction history and asks the user only if no usable cost can be verified. The routine can contextualize that fallback question, but frequency never supplies a dollar amount. Facts are appended as linked records when understanding changes and never count as action approval. Memory correction happens conversationally: when a clear user correction refers to one specific recent financial fact, Victoria appends the corrected understanding with provenance; when the target is ambiguous, Victoria asks which purchase the user means. Individual-transaction corrections stay distinct from rolling transaction-profile aggregates. Victoria does not expose a memory-review or memory-edit interface.

Victoria's memory evolves, but historical events, suggestions, approvals, and ledger entries remain immutable. A later correction, revised estimate, or newly learned habit must create a new linked record instead of changing what Victoria previously observed, suggested, approved, or recorded.

## Out Of Scope

The MVP should not include:

- Real bank transfers.
- Plaid transfer or payment capabilities.
- Plaid products beyond user-authorized Transactions access for the transaction-history profile.
- Unbounded or undisclosed Plaid data access.
- Credit card payoff automation.
- Investment recommendations.
- Debt payoff optimization.
- Full budgeting categories.
- Subscription cancellation.
- Multi-user household finances.
- Tax advice.

## Transactions-Only Financial Profile

The first financial profile uses user-authorized Plaid Transactions history only. The headless profile builder derives compact merchant and category spend facts from posted USD purchases in a 90-day window. It checks whether detailed category, merchant entity ID, and payment-channel metadata are present, reports per-field coverage, uses a detailed category when supplied, and adds channel aggregates when available. Missing metadata falls back to the broad category and is never inferred. It records source, observation dates, transaction count, and sample confidence; raw transaction identifiers remain only in the minimal transaction sync read model and are not copied into profile memories. Profile facts persist in the user memory store and use the same semantic retrieval path as explicit preferences and habits. Server-side adapters support cursor-based Plaid sync, AES-256-GCM-encrypted Item-token storage, and consent-checked profile refresh. The local mock chat runtime now accepts a completed profile through a writer adapter that updates the exact user-scoped provider queried by chat. Plaid sync and the persistent runtime are still opt-in: no Plaid refresh route, live credentials, or Supabase project is configured in the default application.

The approved transactions-only profile is designed around these constraints:

- Plaid data access must follow user authorization and clearly disclosed purpose. This profile requests Transactions only; balances, identity data, account metadata, transfer, and payment scopes are excluded.
- A profile is derived, potentially incomplete context, not ground truth or financial advice. Preserve source, observation time, freshness, and uncertainty for profile facts; do not silently present stale or inferred facts as current.
- Keep provider data and derived profile data scoped to the correct user, access-controlled, and subject to documented retention, refresh, disconnect, and deletion behavior before implementation.
- The profile and its retrieval layer may provide context but cannot approve actions, create ledger entries, initiate transfers, or override deterministic policies. Provider-derived data does not constitute user approval.
- Inject only context relevant to the current turn, with explicit limits and provenance. Do not expose raw account identifiers or unnecessary transaction details to the conversation agent.
- A profile may inform an estimate, but estimates remain estimates and any savings ledger write still requires the existing exact user confirmation.
- Any future capability must not enable real money movement. Access must be limited to authorized read purposes; it must not enable transfer or payment capabilities.

Before live transaction reads are enabled, deploy and verify the migrations, configure authenticated routes and secret-managed keys, and define transaction retention plus Item disconnect/deletion and encryption-key rotation. No live provider or database testing has been performed as part of this implementation.

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
