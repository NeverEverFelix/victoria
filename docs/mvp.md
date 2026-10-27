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

### Memory Learning Boundary

Episodic retrieval checks current memory corrections, inactive-interest records, and forget markers; a matching episode is suppressed so it cannot reintroduce retired context. This suppression uses topic overlap between the lifecycle key and the episode's summary/evidence, so durable event-level episode provenance remains a follow-up.

The provider path can also consider avoided-spend and regretful-spend turns, and can retain up to eight facts per turn. It does not run during pending approval/correction or real-money-movement requests. Provider failures preserve the normal response and emit a privacy-safe operational signal without logging message content.

Automatic conversational learning is limited to direct, affirmed, first-person, stable, ordinary preferences, recurring habits, stated savings goals, ordinary hobbies/interests, clear answers to a typical-spend question, and recurring hobby-spend statements with an explicit time period. Provider extraction also considers ordinary personal statements and pattern reflections when deterministic phrase rules do not match, plus unclear turns without an uncertain financial intent; capturing a fact does not replace the ordinary response or a needed follow-up. One message can store multiple explicit recurring activity-spend amounts as separate facts; directly stated activity-to-category or activity-to-merchant wording can be learned beyond the original fixed sentence forms, while questions and guesses remain unconfirmed. Victoria acknowledges stable preference captures, but does not interrupt a pending financial action to announce scoped choices. A monthly-versus-annual answer for one expense stays in that conversation and is not stored as a general preference. After the user explicitly confirms a mocked ledger entry for an employer-covered recurring expense, Victoria may store a concise, evidence-linked observation of that behavior and the chosen planning horizon. This observed example is not a standing preference; future similar decisions may recall it as a gentle cue and must ask what the user wants this time. Ambiguous, tentative, hypothetical, one-time, or inferred details are not stored outside that confirmed behavioral observation; when clarification matters to the current conversation, Victoria asks a focused follow-up first. Hobby spend is labeled as user-reported unless an exact matching authorized transaction category or a user-confirmed activity-to-category/merchant mapping is available; Victoria does not infer a hobby's cost from a loosely related label. If an activity spend question has no reliable amount or current linked summary, Victoria asks for a typical amount and period or an explicitly identified transaction label. User-reported amounts show when they were last noted; transaction summaries disclose their observation window and may not reflect current spending. Relevant recalled interests surface in activity-specific planning, routine, goal, or spending reflections when exact/known-alias topic matching or semantic retrieval (cosine similarity at least 0.76) identifies the interest and the message also contains a concrete use cue; incidental mentions in unrelated requests do not trigger personalization. The initial semantic threshold needs hosted relevance evaluation. Victoria identifies remembered context plainly and invites correction when it may be stale. Sensitive personal details and credentials/account identifiers are never stored as conversational memories. With a non-mock OpenAI model and API key configured, structured provider extraction and episodic summaries are enabled by default and can be disabled with `OPENAI_MEMORY_EXTRACTION_ENABLED=false` and `OPENAI_EPISODIC_SUMMARIES_ENABLED=false` respectively. Extracted facts and episode summaries still pass evidence, privacy, confidence, and user-attribution checks. Episodes are summarized only at explicit conversation finish or context rollover, and store concise evidence-linked user summaries rather than raw transcripts. Completed mocked-ledger outcomes may be attached as separate typed provenance only from a completed entry returned by the domain tool; assistant wording and model-generated claims cannot establish persistence. A fresh, validated episode can match through a cosine similarity score of at least 0.76 or two meaningful shared terms across its summary/evidence and the current message. See the [memory learning decision](decisions.md#predictable-memory-learning-boundary), [Story 20](user-stories.md), and [Story 21](user-stories.md) for the full behavior.

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

### Employer-Covered Recurring Expense

```text
My gym costs $35 a month, but my company now covers it. Is it a good idea to put that money elsewhere?
```

Expected behavior:

- Treat the covered recurring expense as a budgeting and savings moment, not a request to move real money.
- Respond to the user's actual budgeting question with warmth and awareness of what the expense made possible; when a relevant interest is remembered, acknowledge it naturally rather than reducing the reply to a ledger prompt.
- State the monthly amount and its annualized value as a projection only, and ask which figure the user wants to use as the allocation target: the monthly amount or the annual projection. Do not turn the annual projection into an amount already saved or recordable.
- Suggest recording only the current monthly amount in the mocked ledger, after explicit confirmation.
- If the user repeats or clarifies the annual target, affirm the annual planning target and restate that a clear “yes” approves only the current month's stated monthly entry; do not ask whether the projection is already saved or imply money can be moved.
- Do not claim to know the user's complete financial picture or choose a destination without enough information.

### Ended Recurring Activity Cost

When a user clearly says they stopped an activity that cost a stated amount each month, Victoria can treat that as room in the budget and answer whether setting it aside seems sensible. Compact monthly wording such as "$35-a-month" or "$35/month" counts as a stated period when one positive amount is clear. The annual amount is a conditional projection if the monthly cost stays out of the budget, not money already saved. A monthly or annual planning choice does not approve a ledger entry; only the current month's amount can be offered for a separate, confirmed mocked entry. If the user insists on the annual amount after a current-month offer, Victoria closes that offer and clarifies whether the annual amount is a future target or money already set aside. Read-only questions do not approve a pending proposal, and a clear refusal remains effective when followed by a separate question. A tentative plan to quit does not establish avoided spending.

Victoria assembles a typed, conversation-scoped turn context from recently stated recurring costs before resolving references such as “both.” A provider may choose among those grounded source turns, while deterministic code validates the references and performs cents arithmetic. The context may also prompt a clarification when a new request resembles a recently completed mocked entry; transcript text alone never counts as proof or approval. This first context slice uses recent turns, so durable event-level identity across longer conversations remains future work. After an agent restart, a repeated approval without a current trusted entry reference asks whether it is a separate occurrence instead of claiming the entry was recorded.

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
- Treat money as a resource for living, not a score to maximize. Help users weigh saving alongside safety, comfort, pleasure, relationships, and meaningful plans.
- Recognize the emotional weight of financial decisions and respond with warmth, curiosity, and compassion, without acting as a therapist or claiming clinical expertise.
- Keep the tone mature, caring, graceful, gently charming, practical, and nonjudgmental.
- Do not pressure users to save when spending better serves their stated priorities.
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

In persistent local and hosted chat, a pending savings-entry correction is stored as an append-only proposal scoped to its user and conversation. Exact approval or decline adds a terminal transition. A corrected ledger amount remains a signed adjustment linked to the original entry; the original amount is never overwritten.

When explicitly injected, the SQLite context adapter keeps up to 20 user and Victoria messages for 30 minutes and queues a PostgreSQL backup. `MemoryOrchestrator` sits above the SQLite/PostgreSQL adapters: it versions changed learned facts, filters stale or superseded profile memories, applies per-turn memory bounds, routes profile refreshes into durable semantic memory, and invalidates the short-lived SQLite cache after profile writes. The local chat route uses PostgreSQL directly for short-term context and durable facts when `DATABASE_URL` is configured, while keeping the local signed-session boundary and mocked ledger. The product chat uses the configured provider model; headless tests may inject mock adapters. It is limited to `APP_ENV=local`, requires the existing local configuration checks and a loopback `*_local` database, and uses OpenAI semantic embeddings when a real non-placeholder key is configured; without a usable key, retrieval falls back to recent persisted facts. Headless tests may inject mock memory directly. With a local database, an unanswered avoided-spend amount clarification also survives a runtime restart for up to 30 minutes and remains user-and-conversation scoped; replying with an amount creates a fresh suggestion that still requires confirmation. Pending savings proposals now also survive a runtime restart. Exact confirmation writes one durable mocked-ledger entry and a terminal proposal transition, so retries return the existing entry and weekly progress includes it after restart. Approved goal allocations are stored as separate append-only rows linked to saved entries; they can be read and retried across local runtime instances without changing the original entry. Pending goal-allocation proposals, issued exact-action approvals, and terminal outcomes also survive a local runtime restart through linked append-only records. Approved savings-entry corrections are persisted as signed adjustments and contribute to effective amounts and weekly totals after a runtime restart. Migrations `0011` through `0015` hold local persistent chat state and are also applied to staging; migration `0019` enforces logical 24-month memory expiry during reads. Staging uses a separate server-only persistent runtime after migrations `0010`–`0019` were applied and verified. It verifies bearer access tokens with Supabase Auth, derives the user ID only from the verified subject, and uses PostgreSQL directly for short-term context, durable memory, pending approvals, and mock ledger state; no ephemeral SQLite state is used. Chat and memory-management routes use the same Supabase Auth boundary, so a user can continue a conversation, retrieve relevant memories, and inspect/correct/forget those memories under one identity. Real money movement remains disabled. Durable conversational memories store user-scoped preferences, recurring habits, stated goals, and transaction-derived financial patterns as structured facts with evidence, confidence, source, and optional observation window. Migration `0004_semantic_user_memory.sql` adds versioned pgvector embeddings, HNSW cosine search, Supabase row-level security, and a bounded semantic search function. Migrations `0001`–`0019` are applied to the linked staging project; RLS role privileges and the retention routine were verified there. Production migrations `0009`–`0019` remain pending. The persistent runtime composes PostgreSQL/Supabase memory and a concrete OpenAI embedding adapter; semantic retrieval falls back to recent persisted facts when embeddings are unavailable. With a real model and key configured, provider extraction can identify stable ordinary context from eligible user turns. It rejects sensitive, temporary, unsupported, quoted, negated, hypothetical, and third-party content. Episodic summaries run with a real provider on conversation finish or context rollover. A validated episode may shape a later ordinary reply only when it is no more than 90 days old, not future-dated, and clearly matches the current topic; episodes do not affect financial decisions. On ordinary financial reflections, relevant retrieved user-stated preferences and goals can shape Victoria's response across conversations. A matching remembered coffee, takeout, or named-merchant routine can also provide supportive context without implying a spend amount; neither kind of personalization changes financial decisions or approval requirements. Recurring actions linked to a named merchant have merchant-specific memory keys, separate from category routines; when a matching routine exists but typical spend is unknown, Victoria first checks available transaction history and asks the user only if no usable cost can be verified. The routine can contextualize that fallback question, but frequency never supplies a dollar amount. Facts are appended as linked records when understanding changes and never count as action approval. Memory correction can happen conversationally: when a clear user correction refers to one specific recent financial fact, Victoria appends the corrected understanding with provenance; when the target is ambiguous, Victoria asks which purchase the user means. Individual-transaction corrections stay distinct from rolling transaction-profile aggregates. Authenticated server-side controls now allow a user to inspect current memories, append a correction, or suppress one fact from future recall. Forgetting suppresses a fact immediately; after a 30-day recovery window the scheduled retention job physically deletes the forgotten memory lineage and embeddings. Database backups may retain copies until their configured expiration. No memory UI or bulk-delete endpoint is included.

When a real provider is configured, an optional, non-stored reply personalization step can adapt ordinary reflective responses to relevant user-stated communication preferences and conversational context. It receives the current message, the deterministic baseline, and at most six relevant user-stated or corrected memory projections; it does not receive the conversation transcript. It may adjust tone, detail, phrasing, or offer one grounded next step; it cannot change classification, financial estimates, approval, or tools. It identifies the memory facts it used, preserves the baseline meaning, and falls back to the deterministic reply when unavailable or invalid. Precise activity-spend answers keep their existing source disclosures and are not rewritten. Set `OPENAI_PERSONALIZED_REPLIES_ENABLED=false` to disable it. The mock/default runtime does not make these calls.

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

The first financial profile uses user-authorized Plaid Transactions history only. The headless profile builder derives compact merchant and category spend facts from posted USD purchases in a 90-day window. It checks whether detailed category, merchant entity ID, and payment-channel metadata are present, reports per-field coverage, uses a detailed category when supplied, and adds channel aggregates when available. Missing metadata falls back to the broad category and is never inferred. It records source, observation dates, transaction count, and sample confidence; raw transaction identifiers remain only in the minimal transaction sync read model and are not copied into profile memories. Profile facts persist in the user memory store and use the same semantic retrieval path as explicit preferences and habits. Server-side adapters support cursor-based Plaid sync, AES-256-GCM-encrypted Item-token storage, and consent-checked profile refresh. Authenticated staging API routes now expose consent disclosure/grant, Link-token creation, public-token exchange, profile refresh, and disconnect behind an explicit sandbox opt-in. A client sign-in, consent, Link, profile-summary, and disconnect journey is implemented against these routes. Production Plaid remains disabled; deployed signed-in end-to-end verification is outstanding.

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

Ordinary conversation uses a separate provider response path automatically when a real model and key are configured. It receives bounded recent dialogue, relevant memories, and the canonical provenance-aware financial context for read-only answers. Validated derived amounts may be used only with their period and conditions intact; projections remain distinct from recorded savings. Eligible retrieved memories are deduplicated to their newest current fact and ranked for the current message and active workflow before the context cap. Prompt context and personalization share this deterministic ranking while retaining separate category, confidence, provenance, and lifecycle eligibility rules. Replies stay concise by default and can expand when the user explicitly asks for explanation, comparison, or brainstorming, with a larger validated response budget for detailed requests. Read-only financial reflections can be answered even when phrased as statements and while a proposal is pending; the proposal remains unchanged until the user explicitly approves or declines it. Historical event references resolve only within the current user's current conversation; unmatched or ambiguous references trigger clarification and never become action targets. A rejected generated draft gets one safe retry before the baseline response is used. Optional stable-memory extraction may inspect validated, non-sensitive read-only turns, including savings-progress questions, but skips uncertainty, memory lifecycle requests, financial action intents, and active pending-action turns. Learning never replaces a response or changes action state. The provider response has no authority to create a mocked ledger entry, alter a pending approval, or move real money; deterministic workflow and safety validation retain those boundaries. Mock conversation mode remains available for headless regression tests.

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
