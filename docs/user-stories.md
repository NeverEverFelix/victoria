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
- Given the event classification confidence is below the provisional 0.70 floor, Victoria asks for clarification and creates no proposal.
- Given Victoria asks because intent confidence is low, it uses that unresolved turn as context for the user's next reply and clears it when the user switches to a clear new intent.
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
- Given Victoria knows another user's typical DoorDash order, Victoria does not use or reveal it.
- Given Victoria does not know the typical amount, Victoria asks what the user usually spends.
- Given the user provides an amount, Victoria can propose a savings action.
- Given the user confirms, Victoria creates a mocked ledger entry.
- Given the user explicitly remembers a typical USD spend for that merchant, Victoria may use it for a later estimate for the same merchant and user; the estimate still requires confirmation.
- Given no exact user-owned merchant memory or known habit matches, Victoria asks for the amount rather than guessing from unrelated memories.
- Given a matching merchant-specific routine exists but no typical spend amount is remembered, Victoria checks available transaction history first and asks the user only if no usable cost can be verified; routine frequency alone is not a monetary estimate.
- Given Victoria asks for typical spend at a known merchant and the user provides a valid amount, Victoria uses it for the pending estimate and appends it to that user's merchant memory for future estimates.

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
- Given that amount belongs to another user, Victoria does not use or reveal it.
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
- Given the user says yes and repeats the pending amount in a clear instruction to record it, Victoria confirms only when the amount matches the pending suggestion; a different amount does not approve it.
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
- Given the entry was corrected, the allocation uses its currently effective amount.
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

## Story 11: Correct A Recorded Savings Amount

As a user, I want to correct an amount Victoria recorded so the ledger reflects updated information without losing the original history.

Example:

```text
Victoria: I recorded $27 in your Victoria savings ledger.
User: Correct that recorded entry to $24.
Victoria: I can reduce the recorded amount by $3, making the corrected total $24. The original entry will stay in the history. Please confirm this correction.

User: I need to correct that entry. I avoided $18, not $20.
Victoria: I can correct the amount to $18. The original entry will stay in the history. Please confirm this correction.
```

Acceptance criteria:

- A correction targets a completed mocked entry belonging to the user.
- Victoria asks for explicit approval before recording the correction.
- Approval appends a signed adjustment linked to the original entry; the original remains unchanged.
- Effective weekly totals use the corrected amount while retaining the original entry's reporting week.
- If the target entry is unclear, Victoria asks which entry and makes no change.

## Story 12: Build And Use A Transactions-Only Financial Profile

As a user, I want Victoria to use financial information I have authorized it to access so that its support can reflect my financial context.

The first profile is limited to transaction history. This story does not include balances, identity data, account metadata, or other Plaid products. The server-side sync, encrypted token storage, profile refresh, semantic persistence, and explicit runtime adapters exist; deployment route mounting and live provider/database configuration are still intentionally outstanding.

Expected behavior:

- Victoria explains the data purpose and asks the user to connect/authorize before accessing Plaid data.
- The connection requests Plaid Transactions only.
- The profile records source, observation time, freshness, and uncertainty for derived facts, and distinguishes observed facts from estimates or inferences.
- Victoria uses relevant profile context without exposing unnecessary raw transaction or account details.
- For an avoided-spend estimate, relevant user memory is preferred; if it is absent, Victoria may choose an available connected transaction-history source without asking for each lookup. The provider must use the user's existing bank-link authorization and return no result if the connection is unavailable or revoked.
- Missing, stale, conflicting, or unavailable data leads to cautious wording or a clarifying question; it is not silently treated as current fact.
- In the optional provider seam, transaction summaries older than 90 days, future-dated summaries, malformed summaries, or summaries based on fewer than three purchases are treated as unavailable.
- The user can disconnect access and invoke documented data deletion/retention behavior.
- Profile data never approves an action. Savings suggestions still require explicit approval, and no profile flow may move real money.

Acceptance criteria:

- Given no active user authorization, no Plaid data is fetched or injected.
- Given relevant user memory exists for an avoided-spend estimate, Victoria uses that memory before considering transaction history.
- Given relevant memory is absent and a connected transaction-history source is available, Victoria may request only the matched merchant's bounded typical-spend summary without a per-lookup approval prompt.
- Given data belongs to another user, it cannot appear in the profile or inference context.
- Given a profile fact is stale or inferred, its status is available to the agent and uncertainty is reflected in the response.
- Given a profile fact is stored, its source window, record count, and confidence are retained, and the fact is available to user-scoped semantic retrieval.
- Given the specialist fails or returns invalid/conflicting data, Victoria falls back safely without a financial mutation.
- Given a user disconnects, future refreshes and inference use stop and the agreed retention/deletion behavior is applied.
- Given a profile-based estimate is suggested, exact user confirmation remains required before a mocked ledger entry is created.
- Given transactions are pending, outside the 90-day window, malformed, non-USD, or not positive purchases, they do not contribute to the initial profile.
- Given profile facts are created, they include provenance, observation dates, sample count, and confidence, and contain no raw transaction identifiers.

## Story 13: Remember Explicit Preferences, Habits, And Goals

As a user, I want Victoria to remember clear preferences, recurring habits, and stated goals so future conversations can reflect what matters to me.

Example:

```text
I prefer saving $20 rather than $50 at a time.
```

Expected behavior:

- Victoria records a user-scoped preference with the user's wording as evidence and a confidence value.
- Victoria records a recurring habit only when the user states a recurring pattern, and a goal only when the user states a goal or saving target.
- A speculative merchant-spend amount may be stored as low-confidence evidence, but it is not used for estimates unless verified by more reliable user memory or transaction history.
- Direct recurring-spend statements such as “My usual spend at Blue Bottle is around $6” are stored as merchant-specific habits, while non-recurring or unclear amounts are not inferred as typical spend.
- Recurring behavior tied to a named merchant, such as ordering lunch from DoorDash on Fridays, is stored separately from both another merchant's routine and a generic category habit.
- Victoria asks before turning a remembered goal into a structured savings goal; creating that goal does not create an allocation or move money.
- Any later allocation of a recorded savings entry to a structured goal requires its own fresh, exact-action approval.
- A clearly stated newer fact is appended and linked to the prior fact it supersedes; identical facts are not duplicated.
- Tentative, ambiguous, or conflicting statements are not stored as facts.

Acceptance criteria:

- Given a direct savings-amount preference, the fact is available in that user's conversational memory.
- Given a direct recurring habit or stated goal, its evidence-backed fact is available in that user's conversational memory.
- Given a directly stated goal, no structured goal exists until the user explicitly confirms Victoria's creation prompt; declining leaves only the conversational fact.
- Given an explicit confirmation to create a structured goal, the goal is user-scoped and idempotent; another user's goals remain isolated.
- Given the user says they theorize or think they spend a certain amount at a merchant, Victoria checks available transaction history, treats differences under $1 or 15% as broadly consistent, and appends a linked transaction-supported estimate for larger differences while identifying the evidence basis.
- Given a tentative statement, no fact is stored.
- Given a newer fact on the same topic, the earlier record remains unchanged and the new fact links to it.
- Remembering a fact never counts as approval for a mocked ledger or goal-allocation action.

## Story 14: Correct A Remembered Financial Detail In Conversation

As a user, I want to correct Victoria naturally when it gets a past spending detail wrong so it can use my correction in future conversations without making me manage a memory list.

Example:

```text
Victoria:
Your linked transaction history shows about $27 at Blue Bottle that day.

User:
No, that's not right. I actually spent $40 that day.

Victoria:
Thanks for correcting me. I'll remember that you spent $40 on that day. I haven't changed or recorded any money.
```

Expected behavior:

- Victoria uses the immediately relevant conversation to resolve the corrected financial fact.
- A correction to one transaction stays distinct from a rolling merchant/category profile aggregate.
- Victoria appends the user's correction as evidence and links it to the prior fact where available; prior history is not rewritten.
- If multiple facts could be the target, Victoria asks which purchase or day the user means and stores nothing until clear.
- The correction only changes conversational understanding. It does not update bank history, propose savings, or create a ledger entry.
- A memory correction appends a linked fact; it does not rewrite the prior fact.
- A user can review current learned memories, correct a remembered fact, ask Victoria to forget a selected fact or all conversational memories, and pause/resume memory through ordinary chat language.
- Victoria asks which fact to forget when the request does not identify one uniquely. Forgetting does not change financial events, approvals, or ledger history.
- Transaction-profile memories are identified as connected-profile data and remain managed through profile disconnect/deletion controls.

Acceptance criteria:

- Given a clear correction and one unambiguous recent financial fact, Victoria appends the corrected understanding and retrieves it for a relevant later turn.
- Given an aggregate Plaid profile fact, correcting one day's amount creates a linked transaction-detail fact without replacing the aggregate.
- Given no unique target, Victoria asks a follow-up and creates no memory record or financial action.
- Given a correction message during a pending ledger approval/correction, the existing approval flow retains control.

## Story 15: Learn Stable Context And Summarize Long Conversations

As a user, I want Victoria to retain a small amount of useful context from ordinary conversations so future conversations can feel continuous without me managing a memory list.

Expected behavior:

- When the optional memory extraction provider is enabled, a language model proposes up to three stable, useful facts explicitly stated by the user in the current turn; deterministic validation decides whether any candidate may be retained.
- The model proposes candidates only. It cannot write durable memories or authorize financial actions.
- Victoria retains only candidates with exact supporting evidence, high confidence, user attribution, affirmed statements, and ordinary sensitivity.
- Quoted or third-party claims, negations, hypotheticals, temporary states, transaction details, and sensitive personal information are not retained through this path.
- When short-term conversation context reaches its 20-message limit, an optional summarizer may append a compact episode summary from bounded user-authored context. It must include supporting excerpts and pass the same user-attribution and sensitivity checks.
- Victoria may refer to a retrieved episode in an ordinary reflection only when it is no more than 90 days old and clearly matches the current topic; old, future-dated, malformed, or unrelated episodes are ignored.
- Memory learning and summaries remain internal. The user manages memory only through ordinary chat language: review, correct, forget a selected fact or all conversational memories, and pause/resume. No separate settings screen offers direct memory changes.
- On an ordinary financial reflection, Victoria may use a relevant user-stated preference or goal from prior conversations to make its reply more personal, while keeping the language factual and brief.
- When an ordinary reflection matches a remembered recurring coffee, takeout, or merchant routine, Victoria may refer to that routine and ask what would feel manageable, without inferring a spend amount or treating the routine as approval.
- Victoria may briefly combine up to four relevant memories in one ordinary reflection. It should leave unrelated preferences and goals out, and ask what the user wants to focus on rather than presenting memory as a conclusion.
- Both provider features are disabled by default and are currently opt-in only in local development. No provider calls are made by default.

Acceptance criteria:

- Given a stable, explicit preference in an ordinary message, an enabled extractor stores it with the user's evidence and it can be retrieved in a later conversation.
- Given a relevant remembered preference or goal and an ordinary financial reflection in a later conversation, Victoria shapes its reply around that context; unrelated users do not receive it and it does not create a financial action.
- Given multiple relevant memories and an ordinary reflection, Victoria may combine up to four in a brief response; unrelated retrieved preferences are omitted and no financial action is created.
- Given weak, temporary, sensitive, unsupported, quoted, third-party, negated, or hypothetical extraction, no memory is stored.
- Given extraction or summarization failure, the current chat turn still completes and no financial action is approved.
- Given the short-term context reaches its limit, a supported episode summary is appended; unsupported or sensitive summaries are discarded.
- Given a fresh, relevant episode summary is retrieved during a later ordinary reflection, Victoria may briefly reconnect to that prior topic and invite correction; unrelated or more-than-90-day-old episodes are not surfaced.
- Given the user corrects a learned fact later, the correction is handled through the existing conversational correction flow and history remains append-only.
- Given the user asks what Victoria remembers, only current memories for that user are summarized in chat.
- Given the user corrects a remembered fact in chat, Victoria appends a linked correction rather than rewriting the earlier value.
- Given the user asks Victoria to forget a uniquely matched conversational memory or all conversational memories, Victoria removes the relevant conversational records and embeddings while financial records remain unchanged.
- Given a forget request could match multiple memories or none, Victoria asks a follow-up and changes nothing.
- Given the user asks to pause or resume memory in chat, Victoria changes learning and personalization state and confirms the change.
- Given the user pauses or resumes memory in settings, the displayed state reflects the API result and saved facts remain reviewable.
- Given the user chooses Forget all in settings, an explicit confirmation precedes deletion, conversational facts clear, and separately managed profile data is disclosed as unaffected.

## Priority Order

The first implementation should focus on:

1. Avoided spend with user-provided amount.
2. Vague savings moment.
3. Confirm suggested savings.
4. Avoided spend without known amount.
5. Regretful spend.

This order proves the core safety and conversation loop before adding richer memory, progress summaries, or goals.
