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
- Given the user asks whether to record an identified avoided-spend amount in the same message, Victoria may present the savings suggestion but must still wait for a separate explicit confirmation.
- Given an active monthly recurring-cost suggestion and a combined annual-math/current-month record request, Victoria answers with the conditional annual projection and asks for confirmation of only the pending monthly amount.
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
- Given the user revises a pending suggestion, Victoria must match the revision to the active proposal; an unresolved revision leaves it unchanged, while an accepted amount or reason change creates a linked proposal that needs fresh confirmation.
- Given a revision refers to an older or non-active event, Victoria must resolve it against the exact user-and-conversation event history before applying it. Until a unique historical target is resolved, it must not apply the revision to the active proposal and asks the user to decline the active suggestion before starting a separate request.
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

The first profile is limited to transaction history. This story does not include balances, identity data, account metadata, or other Plaid products. A client sign-in and consent-to-Link journey is implemented for the explicitly enabled staging sandbox runtime. Hosted end-to-end verification remains outstanding; production Plaid remains disabled.

Expected behavior:

- Victoria explains the data purpose and asks the user to connect/authorize before accessing Plaid data.
- The client supports Supabase email/password sign-in and account creation, then loads the signed-in user's consent notice and connection status.
- Plaid Link does not open until the signed-in user acknowledges the current Transactions notice and the consent and Link-token routes succeed; the client fails closed if the notice includes another product, balance access, or transfers.
- After Link returns, the client exchanges the public token through the authenticated API and displays only user-scoped aggregate profile summaries. Disconnect requires a separate confirmation and requests local data deletion.
- `GET /api/plaid/consent` returns the fixed data-use notice and current connection status; `POST /api/plaid/consent` records an append-only grant only after the user confirms that exact notice version.
- The connection requests Plaid Transactions only.
- `POST /api/plaid/link-token` requires active consent, and `POST /api/plaid/token-exchange` stores the token encrypted and starts the initial profile sync.
- `POST /api/plaid/profile/refresh` refreshes only the authenticated user's profile; `POST /api/plaid/disconnect` supports user-scoped disconnection and deletion.
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
- Victoria acknowledges a remembered fact without suggesting a savings entry or creating a goal allocation.
- A clearly stated newer fact is appended and linked to the prior fact it supersedes; identical facts are not duplicated.
- Tentative, ambiguous, or conflicting statements are not stored as facts.

Acceptance criteria:

- Given a direct savings-amount preference, the fact is available in that user's conversational memory.
- Given a direct recurring habit or stated goal, its evidence-backed fact is available in that user's conversational memory.
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
- Victoria does not expose a memory-management UI. Server-side memory endpoints are specified in Story 16.

Acceptance criteria:

- Given a clear correction and one unambiguous recent financial fact, Victoria appends the corrected understanding and retrieves it for a relevant later turn.
- Given an aggregate Plaid profile fact, correcting one day's amount creates a linked transaction-detail fact without replacing the aggregate.
- Given no unique target, Victoria asks a follow-up and creates no memory record or financial action.
- Given a correction message during a pending ledger approval/correction, the existing approval flow retains control.

## Story 15: Learn Stable Context And Summarize Long Conversations

As a user, I want Victoria to retain a small amount of useful context from ordinary conversations so future conversations can feel continuous without me managing a memory list.

Expected behavior:

- A clear unpunctuated read-only request to talk about a topic can receive an ordinary conversational response without being mistaken for a savings action; financial statements and explicit action requests retain their specialist/workflow handling.
- When a real provider model and API key are configured, Victoria may retain up to eight stable, useful facts explicitly stated by the user in the current turn. `OPENAI_MEMORY_EXTRACTION_ENABLED=false` disables this provider extraction.
- The provider path can run on ordinary personal statements, pattern reflections, avoided-spend and regretful-spend turns, and unclear turns only when no uncertain financial intent was detected. It remains disabled while a financial approval/correction is pending and for real-money-movement requests. Capturing a fact does not change the financial classification or action, and does not replace or interrupt the ordinary response or a needed follow-up.
- Victoria retains only candidates with exact supporting evidence, high confidence, user attribution, affirmed statements, and ordinary sensitivity.
- Quoted or third-party claims, negations, hypotheticals, temporary states, transaction details, and sensitive personal information are not retained through this path.
- When short-term conversation context reaches its 20-message limit, an optional summarizer may append a compact episode summary from bounded user-authored context. It must include supporting excerpts and pass the same user-attribution and sensitivity checks.
- Victoria may refer to a retrieved episode in an ordinary reflection only when it is no more than 90 days old and clearly matches the current topic; old, future-dated, malformed, or unrelated episodes are ignored.
- Memory learning and summaries are internal. Authenticated server endpoints let users inspect, correct, or forget individual current facts; no UI or bulk-delete endpoint is included in this slice.
- On an ordinary financial reflection, Victoria may use a relevant user-stated preference or goal from prior conversations to make its reply more personal, while keeping the language factual and brief.
- When a real provider model is configured, a separate contextual reply writer may adapt an ordinary reflection's wording, level of detail, tone, and one small next step to relevant retrieved preferences, goals, habits, or interests. It must use only supplied memory IDs, identify remembered personal context when it relies on it, and preserve the baseline's factual meaning and question. Precise spending answers with user-reported amounts or transaction summaries keep their source disclosures and are not rewritten.
- Provider personalization is skipped when no relevant eligible user-stated memory is available, and fails back to the deterministic reply on provider errors or invalid output. It cannot classify a financial moment, estimate spending, propose or approve an action, claim money moved, or change the agent decision.
- When an ordinary reflection matches a remembered recurring coffee, takeout, or merchant routine, Victoria may refer to that routine and ask what would feel manageable, without inferring a spend amount or treating the routine as approval.
- Structured extraction and episodic summaries run when a real provider is configured; `OPENAI_MEMORY_EXTRACTION_ENABLED=false` or `OPENAI_EPISODIC_SUMMARIES_ENABLED=false` disables the corresponding behavior. No provider call is made when the model is `mock` or no usable API key is configured. Episodes are still created only when the user explicitly finishes a conversation or its short-term context rolls over; ordinary turns do not trigger a summary call.

Acceptance criteria:

- Given a stable, explicit preference in an ordinary message, an enabled extractor stores it with the user's evidence and it can be retrieved in a later conversation.
- Given a relevant remembered preference or goal and an ordinary financial reflection in a later conversation, Victoria shapes its reply around that context; unrelated users do not receive it and it does not create a financial action.
- Given relevant remembered communication preferences, Victoria adapts the tone/detail/format of varied ordinary reflections while preserving the same deterministic action; unsupported, unrelated, or other-user memories do not shape the reply.
- Given a provider rewrite with an unknown memory ID, unsupported money amount, shaming language, or completed-action claim, Victoria keeps its deterministic response and creates no financial record.
- Given a provider failure, the ordinary reply completes with its deterministic baseline.
- Given weak, temporary, sensitive, unsupported, quoted, third-party, negated, or hypothetical extraction, no memory is stored.
- Given extraction or summarization failure, the current chat turn still completes and no financial action is approved.
- Given the short-term context reaches its limit, a supported episode summary is appended; unsupported or sensitive summaries are discarded.
- Given a fresh, relevant episode summary is retrieved during a later ordinary reflection, Victoria may briefly reconnect to that prior topic and invite correction; unrelated or more-than-90-day-old episodes are not surfaced.
- Given the user corrects a learned fact later, the correction is handled through the existing conversational correction flow and history remains append-only.

## Story 16: Manage Remembered Facts Through Authenticated Server Endpoints

As a user, I want to inspect, correct, or forget a remembered fact so I can keep Victoria's personalization accurate and under my control.

Expected behavior:

- `GET /api/memories` returns a page of the authenticated user's current, fresh memories and bounded provenance fields; its allowlisted `details` identify user-reported activity spend, user-confirmed activity mappings, or linked transaction aggregates without exposing arbitrary internal metadata. `limit` is capped at 100 and `cursor` continues the stable keyset page.
- `PATCH /api/memories` accepts exactly one current `memoryId` and a non-empty corrected value; it appends a linked correction and preserves the original record. Corrections to interests, recurring activity spend, and activity mappings must be clear first-person statements so their structured meaning can be updated; transaction-derived profile aggregates are read-only and can be forgotten or addressed through a corrected mapping.
- `POST /api/memories/{memoryId}/forget` appends a linked suppression marker so the fact is excluded from future retrieval.
- The API verifies the Supabase Auth bearer token server-side and never accepts a user ID from the request body or URL.
- In local persistent development only, inspection, correction, and single-fact forgetting may use the existing signed local chat session; this adds no sign-in or session-issuing flow.
- Forgetting suppresses conversational recall immediately. The linked conversational memory and embeddings are physically removed after a 30-day recovery window; transaction-provider source rows follow their separate 90-day lifecycle.
- There is no bulk-delete endpoint in this slice.
- Memory controls are server-side only; no user-facing page or component is added.
- The Vercel runtime uses PostgreSQL directly for durable memory/context and does not rely on local filesystem state.

Acceptance criteria:

- An unauthenticated or invalid-token request cannot inspect or mutate memories.
- A valid user can list only their current memories; another user's facts never appear.
- A valid correction appends a linked user-correction fact and the prior fact remains in history.
- A valid forget request removes the selected fact from subsequent retrieval immediately; a scheduled retention run physically deletes its linked lineage and embeddings after 30 days.
- Repeated forget requests and unknown/foreign memory IDs do not create extra mutations or reveal whether another user owns an ID.
- Memory-list cursors are validated, stable across new inserts, and remain scoped to the authenticated user.
- Malformed, oversized, or extra-field correction bodies are rejected without writing memory.
- No route accepts a user ID parameter, and no bulk deletion route exists.

## Priority Order

The first implementation should focus on:

1. Avoided spend with user-provided amount.
2. Vague savings moment.
3. Confirm suggested savings.
4. Avoided spend without known amount.
5. Regretful spend.

This order proves the core safety and conversation loop before adding richer memory, progress summaries, or goals.


## Story 17: Continue Chat With The Same Trusted Identity

As a signed-in user, I want chat, relevant memories, and memory controls to share one verified identity so Victoria can continue helping me across sessions without exposing another user's context.

Expected behavior:

- Staging and production chat verify the bearer access token with Supabase Auth and derive user identity only from its verified subject.
- Chat context, durable memory, pending actions, and mocked savings state are persisted in PostgreSQL and scoped to that subject.
- Memory inspect, correction, and individual forget use the same Supabase Auth boundary and subject.
- Missing or invalid credentials and unavailable runtime configuration fail closed.
- The chat runtime does not use ephemeral local filesystem state and cannot move real money.

Acceptance criteria:

- The same authenticated subject can retrieve relevant memories in a later conversation and manage those memories through the server endpoints.
- A different subject cannot retrieve chat context, memories, pending approvals, or ledger state.
- Authorization is owner based in the MVP: a verified user may act only on resources scoped to that subject. There are no administrative or cross-user support roles.
- Unauthenticated requests cannot access chat or memory controls.

## Story 18: Learn Only Predictable, Useful Context

As a user, I want Victoria to remember clear, useful preferences without silently retaining sensitive or uncertain personal details.

Expected behavior:

- Automatically remember only clear first-person, affirmed, stable, ordinary preferences, recurring habits, stated savings goals, and clear answers to a typical-spend question.
- Ask or wait for clarity when the user's statement is tentative, hypothetical, ambiguous, or only inferred; do not store it until the user gives a clear stable statement.
- Never store credentials or account/card/routing identifiers, sensitive health/political/religious/sexuality/race/ethnicity/immigration details, third-party statements, or temporary circumstances as conversational memory.
- Preserve exact supporting evidence, provenance, user scope, and linked append-only updates.
- Keep transaction-profile facts separate with their existing authorization and freshness rules.
- Keep deterministic direct learning independent of provider availability; provider extraction must pass the same privacy and evidence validation before storage.
- Provider extraction or validation failures continue the ordinary turn without provider-derived facts and emit a privacy-safe operational signal; they do not include the user message or provider payload.

Acceptance criteria:

- Clear supported direct statements are acknowledged and stored without a separate confirmation prompt.
- Tentative, ambiguous, hypothetical, sensitive, credential-bearing, and third-party content is not stored.
- Provider-generated candidates pass the same explicit-evidence and privacy gate before storage.
- Memory learning never acts as approval for a savings action.


## Story 19: Retain And Clean Up Personal Context Safely

As a user, I want Victoria to stop using expired or forgotten context and remove it from primary storage on a defined schedule.

Expected behavior:

- Transaction source data and derived profile memories expire after 90 days.
- Unrefreshed conversational facts expire after 24 months; forgotten facts are suppressed immediately and physically purged after a 30-day recovery window.
- Embeddings are deleted with their source fact lineage.
- Short-term chat context expires after 30 minutes; local cache/outbox payloads and hosted context rows receive physical cleanup.
- Financial decisions, approvals, and ledger records keep their separate immutable lifecycle.
- Retention job outcomes and deletion counts are auditable; failed or overdue jobs are detectable and safe to retry.
- Restores are checked in isolation, migrations are reapplied, and retention runs before traffic resumes.

Acceptance criteria:

- Stale and forgotten facts are excluded from recall even if physical cleanup is delayed.
- A successful retention run removes due facts and embeddings atomically and removes expired context.
- An unauthenticated cron request cannot run retention, and job failures produce a non-success response plus an audit/log signal.
- Restore instructions account for backup copies that may outlive primary deletion.

## Story 20: Carry Useful Context Forward When A Chat Ends

As a user, I want Victoria to retain a small, grounded summary of a conversation I finish so a later chat can continue relevant context.

Expected behavior:

- The authenticated client can explicitly finish a conversation with `POST /api/victoria/{conversationId}/finish`.
- Victoria may summarize only eligible user-authored messages from that user's conversation; it does not retain the raw transcript as long-term memory.
- A summary must pass the existing evidence-quote, confidence, user-attribution, sensitivity, and freshness checks before it is stored.
- Finishing without enough eligible context, with episodic summaries disabled, or after a summarization failure succeeds safely without storing a summary.
- Repeating finish for the same unchanged conversation is idempotent and does not create another summary or repeat the provider call.
- A stored episode can inform a later ordinary reflection when topic relevance and freshness checks pass. Relevance accepts either a cosine similarity score of at least 0.76 or at least two meaningful shared terms across the episode summary/evidence and current message. Episodes are created only at explicit conversation finish or context rollover. It cannot change financial classification, estimate, approval, or ledger behavior.
- Provider-based extraction and episode summarization run by default when a real provider model and API key are configured, and can each be disabled with their respective `OPENAI_*_ENABLED=false` flag. Episode creation remains limited to explicit conversation finish or context rollover. Neither enables provider classification or money movement.

Acceptance criteria:

- An unauthenticated or malformed finish request cannot read or summarize another user's context.
- A valid finish request saves one eligible evidence-linked summary and reports whether context was saved.
- Repeated finish requests for unchanged context do not duplicate the memory or invoke the summarizer again.
- Sensitive, unsupported, low-confidence, or quote-free summaries are discarded; finish failures do not delete short-term context.
- A later relevant ordinary reflection may use the stored episode, but an unrelated turn and all financial actions ignore it.


## Story 21: Remember Ordinary Interests And Their Stated Costs

As a user, I want Victoria to remember activities I enjoy and the recurring amount I say I spend on them, so future conversations can account for what matters to me without guessing.

Expected behavior:

- Victoria may remember a clear first-person statement that the user likes, loves, enjoys, or is into an ordinary hobby or interest.
- A clear list of up to eight ordinary interests is stored as independent facts so correcting one does not replace the others.
- Victoria may remember spend tied to an activity only when the user states an explicit USD amount and a recurring period such as per month, per week, per session, or per visit. The record keeps the exact evidence and period.
- One message may state recurring spend for multiple activities; Victoria stores each clear amount/activity/cadence as an independent fact tied to the full original message.
- A one-time purchase, amount without a time period, tentative statement, or spend amount inferred from the hobby is not saved as a recurring spend fact.
- An authorized transaction profile may support spend context only when the activity exactly matches a transaction category; broad or loosely related categories are not treated as hobby spending.
- If the activity label does not match a profile category or merchant, Victoria may use a category/merchant link only after the user directly identifies that transaction label as representing the activity; the link is append-only and can be corrected.
- Direct mappings may use plain statements such as “I categorize my climbing expenses as outdoor recreation” or “For hiking, I use REI as my transaction merchant.” Questions, guesses, and third-party descriptions do not create mappings.
- Victoria uses an interest when its topic matches exactly, through a known activity alias, or through a cosine similarity score of at least 0.76, and the conversation is concretely about planning around it, building a routine, a related personal goal, or its spending. A passing mention in an unrelated request is not enough. When it recalls an interest, it says plainly “I remember you enjoy …” and invites correction if it may have changed. The similarity threshold is an initial setting pending hosted relevance evaluation.
- When no reliable amount or current transaction summary exists, Victoria asks for a typical amount and period or a user-identified category/merchant; it does not guess. User-reported amounts include when they were last noted, and transaction replies disclose the covered date range and warn it may not reflect current spending.
- A clear first-person correction that the user no longer enjoys an activity supersedes the active interest fact. Changes to a recurring spend append linked facts and preserve the earlier statement.
- Existing sensitivity, identity, evidence, expiry, user-scope, and append-only memory rules continue to apply.

Acceptance criteria:

- Given “I love hiking,” Victoria acknowledges and stores an evidence-backed ordinary interest without suggesting a savings action.
- Given “I spend about $45 a month on hiking,” Victoria stores a user-reported recurring amount with its cadence; when asked about hiking spend later, it attributes the amount to the user's statement and asks whether it is still accurate.
- Given “I spend $45 a month on hiking and $30 per week on pottery,” Victoria stores two independent, evidence-linked recurring spend facts and acknowledges both amounts.
- Given an amount with no cadence, or an uncertain/hypothetical spend or interest, Victoria stores no durable fact.
- Given a clear “I don't enjoy hiking anymore” correction, Victoria appends a linked inactive-interest record and does not keep presenting hiking as a current interest.
- Given a different user or unrelated hobby topic, Victoria does not surface the remembered activity or spend.
- A transaction category or merchant is used for hobby spend only on an exact activity match or a direct user-confirmed mapping, with its source, count, and observation window disclosed.
- A user-confirmed activity-to-category/merchant mapping may connect an otherwise unmatched profile fact; Victoria identifies the mapping, keeps transaction-derived totals separate from user-reported recurring amounts, and invites correction.
- Recalled interests and spend never authorize, estimate, or create a savings action.

## Story 22: Employer-Covered Recurring Expense

As a user whose employer now covers a recurring expense, I want Victoria to help me think about the amount that frees up without mistaking my budgeting question for a bank-transfer instruction.

Expected behavior:

- When I state a clear monthly USD cost that my employer now covers and ask whether to redirect it, Victoria recognizes a savings moment and may show the annualized amount as a projection.
- Victoria proposes only the user-stated monthly amount for the mocked ledger and asks before recording it; the annual projection is never treated as a current or guaranteed saving.
- Victoria does not claim access to a complete current financial picture unless an available authorized profile supports that claim.
- If the user explicitly shares an interest in the same message, Victoria remembers that interest and acknowledges it naturally, even if optional provider memory extraction is unavailable.
- If I provide an amount in a follow-up, Victoria uses the conversation context and asks for confirmation instead of asking what the amount was for again.
- If I choose monthly or annual as the planning target, that choice applies to this expense only and is not saved as a general preference.
- An intervening projection question does not erase that choice. If I repeat that I want the annual amount or clarify that it is a future target, she acknowledges the $420/year target and offers to record only this month's $35 toward it. A clear “yes” approves that specifically stated monthly ledger entry; the annual projection itself is never recorded as already saved.
- If I say “record the yearly amount” while the monthly entry is pending, Victoria resolves “yearly amount” to the selected planning target, explains that it is a projection, and asks for confirmation only for this month's entry. That wording alone does not approve or replace the pending action.
- If I change my planning choice from annual to monthly while the proposal is pending, Victoria updates the scoped planning choice without changing the proposed current-month amount or treating my correction as approval.
- After I confirm recording the covered recurring expense, Victoria may remember a compact, evidence-linked observation of the choice and the planning horizon. This is an observed example, not a permanent preference.
- In a later similar conversation, Victoria may recall the prior choice as a gentle cue; she must still leave the current choice open. A tendency may be described only after multiple observed choices support it.
- No real money moves, and a direct instruction to transfer or withdraw money remains blocked.

## Story 23: Ended Recurring Activity Cost

As a user who has stopped an activity with a stated recurring cost, I want Victoria to recognize the amount I may now have room to set aside and answer my planning question without asking me to repeat the cost.

Expected behavior:

- A clear statement that the activity ended, with one positive USD amount and monthly or yearly period, supports an avoided-spend planning moment even if the provider returns an unclear classification.
- Common compact price wording such as "$35-a-month" and "$35/month" supplies the same stated period; tentative cancellations and conflicting periods still require clarification.
- Victoria may present an annual projection from a monthly amount only as conditional on the cost remaining out of the budget. She responds to the user's reason for stopping without shame or medical advice.
- A monthly or annual planning choice is separate from approval. Victoria may offer to record only the current month's amount in the mocked ledger after that choice and must wait for explicit confirmation.
- A read-only planning question can be answered while a proposal is pending without approving or replacing it. A clear refusal in the same message closes the proposal before Victoria answers the separate question. Later projection questions do not reopen a declined proposal.
- A tentative plan to stop, missing period, conflicting amounts, or direct real-transfer instruction does not create a savings proposal from this rule.

Acceptance criteria:

- Given “I quit baseball; it cost me $350 a month. Should I set that money aside?”, Victoria uses $350 for monthly planning and treats $4,200 as a conditional annual projection without claiming either amount was saved.
- A provider's unclear classification does not trigger a question asking for the activity or amount already given.
- An annual planning answer creates no ledger entry; a separate explicit approval can record only one current-month $350 mocked entry.
- “I might quit baseball” does not count as an ended expense.

## Story 24: Resolve References Across Financial Moments

As a user discussing several spending changes, I want Victoria to understand which earlier moments I mean without combining the wrong amounts or recording the same moment twice.

Expected behavior:

- Victoria builds a scoped, typed view of recently stated recurring costs and their source turns. The language model may select which events a planning question refers to, but code verifies that those events exist and calculates any total in cents.
- A question about two clearly identified monthly costs can receive a conditional combined annual projection without creating a savings proposal or ledger entry. If the reference could point to several combinations, Victoria asks which costs the user means.
- If the user asks to record one of multiple costs while requesting their combined projection, Victoria asks which single monthly cost they mean before creating or changing a proposal; an existing pending proposal remains approval-gated.
- A refusal can contain a separate read-only planning request. Victoria closes the pending proposal and answers the separate request when its amount and meaning are grounded.
- A request that may repeat a recently completed entry asks whether this is a new occurrence before opening another proposal. An explicit new occurrence can follow the normal approval flow.
- Transcript-derived context is advisory. It never supplies approval, a bank transfer, or proof of a completed ledger entry.

Acceptance criteria:

- After canceling separate $35/month and $20/month costs, “both over a year” yields a conditional $660 projection and no ledger write.
- With three eligible costs, an unclear “both” asks which two. A model reference to an unknown event is rejected.
- After one $6 mocked entry, a paraphrased request to log that same $6 moment asks whether it is separate; the weekly total remains $6 until a new occurrence and its own approval are clear.

## Story 25: Answer While Learning

As a user sharing a preference or routine while asking for help, I want Victoria to answer my question in the same turn without replacing the answer with a memory acknowledgment.

Expected behavior:

- A validated user-stated memory may be saved during an ordinary turn, but it does not end a turn that also asks a question.
- With the configured provider, Victoria uses the current question, recent ordered dialogue, and relevant memories to give a read-only answer. Retrieved memories are optional context, not facts to recite.
- A separate question can be answered while a mocked savings entry, goal allocation, or entry correction is pending. That question does not approve, change, or cancel the pending action.
- A clearly read-only question about avoided-spend events in the current conversation can be answered while a savings entry is pending, using only the authoritative events scoped to that user and conversation. Mixed approval, decline, revision, or action questions do not use this exception.
- Generated conversation text cannot claim a ledger write or real transfer, offer a new ledger action, or invent dollar amounts. A rejected or unavailable response falls back to a safe reply.
