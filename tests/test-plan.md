# Victoria TDD Test Plan

This file captures the first behaviors that should become tests as Victoria is implemented.

Normative safety rules and their stable identifiers live in `docs/specification/mvp-safety-contract.md`. New behavior tests should include the applicable rule IDs so product decisions remain traceable to executable coverage.

## Agent Behavior

- Read-only replies use a middle response budget for multi-part or longer questions, brief replies for simple turns, and the larger budget only for explicit detail requests; an eligible remembered communication preference can adjust ordinary reply depth, while explicit current-turn requests take precedence. All modes retain amount grounding and safety validation.
- Read-only topic switches handled while a savings proposal is pending receive a typed financial context snapshot and pending-action label; unrelated savings-event records and resolved event references remain absent unless the turn is an explicitly resolved event-history question.
- Every read-only provider request receives one immutable context snapshot bundling its message, role-tagged dialogue, selected sourced memories, relevant lifecycle-filtered episode summaries, validated financial/workflow context, permitted event history, pending-action label, and response depth; episodes remain separate from current facts and financial authority. Response baselines stay outside the snapshot, which repair requests reuse unchanged.
- When a caller supplies a canonical snapshot, responder convenience fields and validation context (dialogue, memory, episodes, workflow, event history, response preference, and response depth) are projected from that same snapshot, even if retrieval changes while the turn is running; reply validation and repair attempts use the same depth and snapshot.
- The snapshot identifies its context boundary as the authenticated user and current conversation without sending concrete user or conversation identifiers to the model; the scope labels and containing snapshot are immutable.
- The context snapshot exposes historical-event and active event/proposal references in a separately frozen, read-only section derived from the same validated financial context; these references do not grant approval or mutation authority.
- Read-only topic switches during pending entry-correction or goal-allocation workflows carry the exact scoped action identity in a frozen descriptive reference; that identity never authorizes approval, and later approval still follows the existing deterministic path.
- Financial Moment, Savings Reasoning, and Companion Voice receive the same frozen context snapshot; upstream specialists may receive it before a baseline reply exists, and the missing baseline is omitted rather than invented. The snapshot conveys no approval or tool authority.
- In a supported financial turn, all three specialist calls share the identical snapshot instance, not merely structurally similar context objects.
- On mixed avoided-spend turns where the ordinary answer is generated separately, the responder receives only the extracted question as its response focus while retaining the full user turn and its financial/workflow grounding in the canonical snapshot; only the deterministic path appends the recording confirmation.
- The OpenAI responder serializes a mixed-turn response focus alongside, not in place of, the canonical full-turn snapshot and is instructed to answer only the focused question.
- If provider generation fails for a recognized mixed-turn question, a narrow deterministic response-focus fallback may answer that read-only question despite a separate pending financial action; it must not mention recording or alter pending action state.
- On the classified ordinary-question route, Financial Moment and the read-only responder share the same snapshot instance when no new memory was learned; repair attempts also reuse the same snapshot object while changing only the baseline.
- Snapshot construction deep-copies and freezes nested financial-context and permitted event-history records so later mutation of source objects cannot change the captured context.
- The snapshot exposes recent dialogue as frozen role-tagged turns, maps the existing `Victoria:` prefix to assistant, and appends the current message as the final user turn; the original transcript strings remain available to deterministic validation and routing.
- Classified read-only financial reflections with a pending savings proposal preserve the `savings_entry` label in both responder input and snapshot, expose no unrelated event-history records, and leave later explicit approval behavior intact.
- Read-only topic switches during pending entry corrections or goal allocations preserve the matching action label, expose no conversation event records, leave the action pending, and retain the later explicit approval path.
- A clear request to replace a pending correction or goal target supersedes the old action; a later bare “yes” cannot approve it, and the replacement needs a fresh proposal and explicit approval. Read-only topic switches still pass through without changing pending actions.
- Pending correction and goal-allocation message routing uses one tested pure policy for approval, decline, replacement, ambiguity, read-only topic switches, and unresolved input; the policy itself has no mutation authority.
- An explicit “let's talk about my budget instead” topic switch passes a pending savings proposal to read-only conversation, creates no entry, and leaves the original proposal available for later explicit approval.
- A free-standing non-financial reflection such as “I feel hopeful about starting my new job” reaches the conversation responder without requiring an explicit topic-switch phrase; an avoided-spend statement such as “I cooked instead of ordering takeout” remains on the finance route.
- Anxiety about “saving money” is a read-only reflection unless the message also includes a concrete amount or explicit action request; it receives a conversational response with no proposal or ledger entry, including if finance classification labels it as avoided spending.
- Anxiety about “saving for retirement” is likewise read-only when no concrete amount or action is requested; adding a concrete amount keeps it on the guarded financial path.
- Worry about “not saving enough” for a goal is read-only without a concrete amount or explicit action and creates no proposal or ledger entry.
- A non-quantified reflection of guilt about spending receives a nonjudgmental conversational response without starting a regretful-spend workflow; explicit amounts continue through financial handling.
- In a mixed turn with a separate ordinary question before an avoided-spend statement, Victoria answers the question and asks one exact confirmation for the financial action; action/approval questions in either position are never extracted as ordinary conversation, and no entry exists before explicit approval.
- If conversational generation fails for an unpunctuated promotion-related anxiety reflection with no validated financial facts or pending workflow, Victoria acknowledges the change and asks a focused question without suggesting a ledger action.
- If conversational generation fails on a mixed budget-overwhelm reflection and low-cost dinner question, Victoria preserves both with a safe financial reflection and a concrete inexpensive meal suggestion; no amount or ledger action is introduced.
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
- A natural-language real-transfer request receives a clear limitation response and does not create a mocked entry or call a transfer tool, including when a savings suggestion is pending; cover sending money to a named goal and withdrawing money from checking.
- Intent classification uses recent conversational context and does not treat colloquial wording such as "move over" as a transfer based on that phrase alone; ambiguous intent asks for clarification.
- An employer-covered monthly expense framed as budgeting advice is recognized as a savings moment, responds to the user's priorities and relevant remembered interests, presents monthly and annual-projection planning options, proposes only the current monthly amount for the mocked ledger, and waits for explicit confirmation; direct transfer requests remain blocked.
- A clearly ended recurring activity with one stated monthly cost supports the same conditional planning choice even when a provider returns unclear; a tentative cancellation does not. The annual projection stays planning-only, and no ledger entry is created by choosing a horizon.
- Compact recurring-price forms, including hyphenated and slash-separated monthly amounts, ground the stated amount and period across provider classifications.
- The turn context lists distinct recurring costs with source-turn references; provider-selected references are accepted only when they match those costs, have enough confidence, and remain planning-only. Two grounded monthly costs yield a conditional combined annual projection; ambiguous combinations ask rather than guess.
- Memory retrieval applies per-category ceilings after selecting the newest version of each fact and ranking for relevance, so a large cluster from one category cannot fill every context slot; provenance and confidence gates remain unchanged.
- When a combined projection request also asks to record one of multiple source costs this month, ask which single monthly cost is intended, keep any existing proposal unchanged, and create no ledger entry.
- On the first employer-covered expense response, Victoria asks which amount the user wants as an allocation target—the monthly amount or annual projection—without introducing a separate destination choice or asking to record anything; after the user chooses, she acknowledges that target and asks confirmation only for the current month's amount.
- Recover an annual choice after an intervening math question and durable proposal restore. If the user repeats the annual choice or clarifies that it is a future target, reaffirm the annual target and state that “yes” would record only this month's explicitly named monthly amount; retain the pending proposal, and never treat the annual projection as already saved.
- Resolve “record the yearly amount” against the selected annual planning target while a monthly proposal is pending; explain the current-period confirmation clearly, keep the proposal amount unchanged, and create no entry until a separate explicit confirmation.
- Resolve period changes such as “actually, use monthly” through typed pending-workflow state; preserve its source event ID, action ID, proposal ID, status, and current-month recordable amount while updating only the selected period/target type. Create no entry until exact confirmation, and reject a reference whose amount or meaning does not match its period.
- A user's short answer to Victoria's prior monthly-versus-annual planning question is resolved against that exchange, remains a planning preference rather than a goal allocation unless an allocation action is explicit, and is answered using the recent conversation rather than repeating an unrelated goal question.
- A period-based follow-up during a covered monthly expense is not treated as a proposal revision without a clear amount or reason; the conversational model can use the validated annual projection while keeping it distinct from the current monthly ledger suggestion.
- If a user refers to the calculated annual projection during a pending monthly ledger suggestion, Victoria recognizes it as a planning preference, not a replacement ledger amount or approval; the pending monthly suggestion remains approval-gated.
- When a user chooses the annual horizon, Victoria acknowledges the conditional annual target, explains it accumulates from the monthly amount, and offers only the current monthly amount for a confirmed mocked ledger entry; the projected annual total is never recordable as if already saved.
- Contextual replies to a financial follow-up preserve the human and emotional context of the prior exchange, use relevant memory without mechanically repeating it, and address the user's choice directly.
- When a follow-up explicitly selects an annual horizon, the provider reply uses the validated conditional projection and carries forward relevant personal context; an inadequate draft is regenerated rather than replaced with a canned personalized sentence.
- When the same message clearly states an ordinary interest, Victoria appends it to that user's memory and acknowledges it in the savings response, including when provider memory extraction fails.
- An unpunctuated emotional reflection about budgets, bills, money, or finances routes to a substantive read-only response even if a finance classifier labels it as avoided spending; messages with explicit amounts or action verbs remain on the finance workflow path.
- If generation fails on a routed read-only budget reflection and there is no pending workflow or validated financial context, the deterministic fallback acknowledges overwhelm and asks one practical prioritization question without inventing balances or amounts; verify end-to-end even when a specialist misclassifies the reflection as avoided spending.
- A monthly/annual answer to a covered-expense planning question is scoped to that conversation and is not extracted as a permanent preference, even if the user says “I prefer to allocate monthly.”
- Only after explicit ledger confirmation does Victoria store a concise semantic observation of the covered-expense-to-savings behavior, including the chosen horizon; similar future turns may recall it without assuming the user will choose the same horizon.
- Repeated monthly/annual choices update an append-only observation count and expose a tendency only when one horizon has been chosen more often across at least two observations.
- Monthly-to-yearly projections use deterministic integer-cents domain math; no model tool call is needed to calculate them.

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
- Local PostgreSQL mode persists approved goal allocations across tool/runtime instances, returns an identical allocation on retry, rejects changed action details, and leaves the linked entry unchanged.
- A pending goal-allocation proposal resumes after runtime restart with the same action and approval IDs; approval records one allocation, while decline remains terminal and records none.
- Local PostgreSQL mode persists an approved savings correction across a tool/runtime restart, applies its signed adjustment to effective amount and weekly total reads, and allows goal allocation against the corrected amount without mutating the original entry.
- A pending savings-entry correction is restored from its user-and-conversation scoped proposal after an agent runtime restart; exact approval appends one correction and a `recorded` transition, while a decline appends a terminal `declined` transition and leaves the entry unchanged.
- Victoria represents a correction or reversal as a new record linked to the original.
- Correcting a recorded amount requires exact approval, appends a signed adjustment, and leaves the original entry unchanged.
- Corrections reject invalid, no-op, cross-user, non-completed, or non-mocked targets, and effective weekly totals retain the original entry's week.
- Model classifications and estimated suggestions are runtime-validated; malformed values and model-supplied approval fields cannot create proposals or ledger entries.
- Model classification and Savings Reasoning confidence are validated; classification or a savings suggestion below the provisional 0.70 floor asks for clarification, and confidence never authorizes a ledger action.
- If a save, correction, or goal allocation succeeds but its reply is lost, repeating the approval reuses the same approval record and returns the existing mocked result without duplicating history.
- Each recorded entry links to the same user, proposal, action, approval, and ledger entry shown in its proposal transition.
- Estimated amounts explain their basis briefly, such as the user's usual spend at a named merchant.
- Monetary conversions, formatting, totals, and calculated projections reject values or results outside safe integer cents.

## Memory Behavior

## Authenticated Chat Route

- The local chat route accepts only a valid signed Victoria bearer session; caller-supplied `userId` fields are rejected and the signed subject scopes memory and tools.
- Missing, expired, or tampered sessions fail authentication; oversized or malformed requests are rejected.
- The local route is unavailable outside local development. With provider credentials it uses model-backed financial understanding and conversation, while ledger tools remain mocked.
- Chat responses are not cached, and the route cannot call Plaid, Supabase, or real money movement providers.
- An explicit user preference shared through one route conversation can shape a later ordinary reply in a different conversation for the same signed user; another user receives no private preference context.
- A pending savings confirmation is bound to its conversation: a bare “yes” elsewhere does not record it, returning to the original conversation can approve it, and a later route visit can read the recorded weekly total.
- A user can correct Victoria's remembered merchant-spend statement through the route; the correction is acknowledged as a separate transaction detail, does not record savings, and does not rewrite the rolling merchant estimate.
- The local terminal chat command starts the server on loopback, issues a short-lived local signed session without displaying the secret or token, keeps turns in one conversation, supports starting a fresh conversation, and shuts down the child server on exit. It requires a real model and key and uses them for financial understanding and conversation without feature switches. The mocked ledger boundary remains enforced.

- Victoria remembers recurring merchants.
- Victoria updates a habit after repeated similar decisions.
- Victoria retrieves relevant goals before suggesting where savings should go.
- Victoria stores conversation context needed for follow-up questions.
- Victoria avoids using stale or unrelated memory for a new decision.
- Victoria can use updated memory for a future suggestion without rewriting an earlier suggestion.
- PostgreSQL is authoritative for remembered decisions, while SQLite caches those durable reads.
- Current conversation context is short-term SQLite memory, scoped by user and conversation, retaining up to 20 user and Victoria messages; it remains available during a PostgreSQL outage while a local outbox retries its backup.
- The local chat route uses PostgreSQL-backed context and durable memories when its local `DATABASE_URL` is configured; without a database, headless tests can use mock memory. The local route must not be available in staging or production.
- Against a dedicated disposable local PostgreSQL database, a memory written through one local chat runtime is recalled by a fresh runtime for the same user, and is not recalled for another user.
- In local persistent chat, an unanswered avoided-spend amount clarification survives a fresh runtime for the same user and conversation; a new amount yields a fresh suggestion requiring explicit approval, and another user cannot retrieve or answer that clarification.
- In local persistent chat, a pending savings proposal survives a fresh runtime; exact confirmation records one immutable `mock_ledger` entry, and weekly progress still includes that entry after another runtime restart. Repeating confirmation cannot create a second entry.
- While a proposal is pending, an amount answer to an older clarification cannot start a new savings action; Victoria reminds the user the current suggestion remains pending, except for grounded revisions, explicit approval/decline, and read-only questions.
- A revision clarification survives a fresh runtime; stale approval cannot record the old amount, a clear revision creates a linked proposal, and only fresh explicit approval records the revised amount.
- In local persistent chat, `GET /api/memories` returns only the signed-in local user’s current facts; invalid or absent sessions cannot inspect memory, forget suppresses listing/retrieval immediately, and scheduled retention physically removes the forgotten lineage and embeddings after 30 days; local correction appends a linked current fact and future retrieval uses the correction.
- Retention jobs delete expired PostgreSQL short-term context, 90-day transaction-profile data, 24-month-old unrefreshed user memories, and forgotten memory lineages plus embeddings; job outcomes are auditable and a protected scheduled handler rejects unauthenticated calls.
- In local persistent chat, concurrent approval and decline attempts for one proposal serialize to one terminal outcome; a recorded entry cannot coexist with a declined or superseded transition.
- In local persistent chat, simultaneous turns for the same user and conversation execute sequentially across runtime instances; different conversations remain independent.
- PostgreSQL can restore unexpired clarification context after SQLite cache loss, and expired context is not returned.
- Durable conversational memories retain user-stated preferences with evidence and confidence, isolate by user, and supersede earlier facts through linked append-only records.
- Durable conversational decisions are append-only and cannot mutate financial event, approval, or ledger history.
- An injected structured extractor can store at most eight stable, ordinary, high-confidence contextual facts only when exact supporting evidence appears in the current user turn; temporary, sensitive, weak-confidence, unsupported, duplicate, or malformed candidates are discarded. It can run on ordinary personal statements, pattern reflections, avoided-spend and regretful-spend turns, and non-financially-uncertain unclear turns, but not during pending approval/correction or real-money-movement requests. Extraction failure preserves the normal response, stores no provider-derived fact, and emits a privacy-safe failure signal without message content.
- Direct automatic memory is limited to clear first-person ordinary preferences, recurring habits, stated goals, and clear answers to a typical-spend question. Sensitive health/political/religious/identity details and credentials/account identifiers fail the shared privacy gate; ambiguous, hypothetical, quoted, third-party, and temporary information is not retained.
- Extraction rejects quoted/third-party, negated, and hypothetical facts even if the words appear in the user's message; memory-extraction failure does not block the chat turn or bypass proposal/approval policy.
- When the 20-message short-term context is about to roll over, an injected episodic summarizer receives only bounded user-authored messages. It stores a compact append-only summary only when confidence and sensitivity checks pass and each supporting excerpt occurs in the supplied user messages.
- Episode prose is grounded only in user-authored evidence; completed mocked-ledger outcomes are stored separately as typed provenance only when projected from a completed `SavingsEntry` returned by the domain tool. Pending entries, assistant acknowledgments, projections, and model-supplied workflow claims cannot establish persistence.
- Persistent chat creates stable owner-scoped turn records and passes exact user-message/turn-ID references to episode summarization; episode memory metadata stores matched IDs separately from ledger outcome IDs, and finish-time summarization loads only completed turns for the authenticated user and conversation.
- Learned memories retain source turn IDs, and append-only correction/forget markers carry those links forward; episodes linked to retired evidence are suppressed while unrelated same-topic episodes with distinct source turns remain retrievable.
- An episode created by explicit finish from completed durable-turn references retains its exact source turn ID, and correcting a linked fact suppresses the episode on a later related turn after a fresh repository is constructed; the persistent PostgreSQL integration repeats this lifecycle across repository restart.
- The queued-turn processor uses an atomic revision claim so concurrent workers invoke the agent at most once, scopes source references to the authenticated user/conversation, and records completed or failed status without implicitly retrying failures.
- Completed queued turns persist their response payload with the lifecycle transition; authenticated result polling is user/conversation-scoped and returns only the same public message/action/classification fields as synchronous chat.
- The Next.js queued-turn route invokes processing only after authentication, returns only public response fields, and polls status/results without caching; unauthorized callers cannot trigger processing or retrieve another user's turn.
- The queued-turn intake route requires a valid idempotency key, derives a keyed request fingerprint, and stores turns in the authenticated user's conversation namespace; replay returns the original turn and conflicting reuse is rejected.
- Episodic retrieval checks current correction and forget markers; an episode with a matching retired topic is suppressed while unrelated episodes remain available.
- A relevant episode summary can shape an ordinary reflective reply only when it is well-formed, non-future, at most 90 days old, and meets either the 0.76 semantic similarity threshold or two meaningful shared terms across summary/evidence and query; unrelated and stale episodes are not surfaced. Episode creation remains limited to explicit finish or context rollover.
- With a real provider model and API key, episodic summaries are enabled by default; `OPENAI_EPISODIC_SUMMARIES_ENABLED=false` disables them. The mock example uses a mock model and placeholder key, so it makes no summary calls regardless of the flag.
- Episodic summary failures or unsupported/sensitive summaries do not block the current turn. Summarizer requests contain only bounded, eligible user-authored messages, and stored summaries require exact evidence quotes and sensitivity checks.
- An explicit “I prefer saving $20 rather than $50 at a time” statement creates an evidence-backed user preference but no savings proposal or ledger entry.
- Tentative, ambiguous, equal-amount, or malformed savings preference statements do not create a memory fact.
- A changed explicit preference appends a fact linked to the prior preference; another user's preference is never returned.
- A direct preference, recurring habit, or stated goal is stored as an evidence-backed structured fact; an identical repeat is deduplicated and an uncertain statement is ignored.
- A relevant retrieved preference or goal shapes an ordinary reflective reply in a later conversation; the response remains user-scoped and cannot create a savings entry or goal allocation.
- With a configured reply personalizer, relevant communication preferences and topic memories may adapt tone, detail, phrasing, and one practical next step across ordinary reflections; classification/action remains unchanged and only relevant user-stated/corrected memory IDs may be used.
- Unknown memory IDs, unsupported money amounts, shaming language, completed-action claims, malformed provider output, or provider failure retain the deterministic baseline and create no financial record.
- Unrelated, inactive, provider-inferred, and transaction-profile memories do not enter the ordinary reply personalizer's context; style preferences may apply across topics only when they clearly describe communication style.
- Specific spending answers that include a user-reported amount or linked-transaction summary keep the deterministic source attribution, date window, and uncertainty wording; provider rewrite is skipped for those turns.
- A matching remembered coffee, takeout, or merchant routine can shape an ordinary reflection across conversations; unrelated routines and other users' routines stay out, and routine frequency never becomes a money estimate.
- A clear ordinary hobby/interest statement is stored as a user-scoped, evidence-linked fact; Victoria surfaces it only on a matching ordinary topic, signals it is remembered, and invites correction.
- A clear list of interests creates one independent evidence-linked memory per listed activity; topic recall remains specific, and correcting one activity leaves the others active.
- A matching interest may shape activity-specific planning, routine, goal, or spending reflections when exact/alias topic matching or a semantic score of at least 0.76 finds the activity and a concrete use cue is present; Victoria identifies the remembered fact and invites correction. Semantic retrieval without a use cue and scores below threshold must not personalize.
- A passing activity mention in an unrelated request does not cause interest personalization; inactive/corrected interests stay out of these replies.
- A recurring hobby-spend fact requires an explicit USD amount and cadence, is labeled as user-reported, and is only surfaced for that activity when asked; Victoria invites correction and creates no financial action.
- A single first-person message with multiple explicit activity amounts and cadences creates one independent evidence-linked fact per activity; a missing cadence or ambiguous activity in one clause is not invented or carried across clauses.
- Hobby spending without an explicit period, a one-time purchase, tentative interest/spend, and sensitive interests fail the learning gate.
- A clear first-person statement that the user no longer enjoys an activity appends a linked inactive-interest fact and prevents future current-interest personalization.
- A transaction-profile category can inform an activity-specific spend reply only for an exact category/activity key match; the reply discloses transaction total, count, and observation window and asks whether the category fits.
- An explicit user-confirmed activity-to-category/merchant mapping can retrieve the linked transaction profile fact; Victoria labels the mapping, source window, and count, asks whether the link remains right, and keeps any user-reported periodic spend separate from transaction totals.
- Tentative, question-form, or sensitive activity-to-transaction mappings do not create memory.
- Natural first-person statements that explicitly categorize an activity's purchases or name a merchant for that activity create the correct user-confirmed mapping; question, uncertain, or third-party wording does not.
- An activity-spend question with no reliable amount asks for a typical amount and period or an explicitly identified transaction label; Victoria provides no guessed dollar figure.
- A recalled user-reported amount says when it was last noted and asks whether it remains accurate; an unavailable/stale transaction profile is not surfaced as a current total.
- A transaction-derived reply states its observation window and that the history may not reflect current spending, then invites correction of the category/mapping.
- Remembering a habit or goal does not create a savings proposal or goal allocation; structured facts remain available as source records for future PostgreSQL semantic/vector indexing.
- A quantified, explicit merchant-spend habit can inform a later estimate only for the same merchant and user; it remains an estimate, needs approval, and does not create a ledger entry by itself.
- When transaction history is unavailable, Victoria asks for the user's typical merchant spend; a valid answer informs the current proposal and appends a linked user-scoped memory fact for later estimates.
- A direct “my usual/typical spend at [merchant] is about [amount]” statement is extracted as a merchant-specific recurring spend, used only for that merchant and user, and remains an estimate requiring normal approval before a ledger entry.
- Direct recurring actions tied to named merchants are stored under merchant-specific habit keys; updating one merchant's habit appends a linked fact without replacing another merchant's habit or generic category habit, and tentative claims are ignored.
- If an avoided-spend turn matches a merchant-specific routine but has no remembered spend amount, Victoria checks available transaction history first. Missing, stale, malformed, or failed provider results lead to an amount question; routine frequency alone never becomes an estimate. A valid answer becomes a distinct merchant-spend memory for later estimates while the routine record remains unchanged.
- A built transactions-only profile can supply a user-scoped typical merchant amount to an avoided-spend proposal when relevant user memory is absent; insufficient profile samples, stale observations, missing merchants, or another user's profile produce a follow-up instead. The estimate is disclosed and no mocked ledger entry is created until explicit approval.
- The local mock runtime's financial-profile writer updates the same transaction-history provider used by its authenticated chat handler; refreshed facts inform the matching user only, and no profile fact approves a ledger write.
- A certain direct merchant-spend claim checked against sufficient recent transaction history confirms a match or appends a linked transaction-supported amount, preserves the user's wording and prior facts, and discloses the data basis.
- A speculative merchant-spend claim may receive a transient comparison against sufficient recent history, but Victoria does not persist it, link it, or use it as a later estimate.
- Transaction summaries are accepted only with at least three purchases, a valid non-future observation time, and an observation time no older than 90 days; stale results cannot correct memory or support a savings estimate.
- Typical-spend summaries use the median of at least three positive safe-integer cent amounts; even-sized samples average the middle pair and round half cents up without mutating the input.
- A speculative spend claim without transaction corroboration is not persisted and cannot produce a savings suggestion.
- The context-source policy prefers relevant memory, selects an available connected transaction source only for a missing estimate, and otherwise asks; unavailable/error/invalid provider results never produce an estimate, and no per-lookup approval is requested.
- The transaction-history provider contract fixture matches case, punctuation, and whitespace variants of the same merchant only within the requested user's scope; unknown merchants and other users' records return no data.

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
- A standalone refusal followed by a question or planning instruction closes the pending proposal; a separate read-only question can be answered without approval or a replacement proposal, and later projection questions do not reopen a declined proposal.
- Repeating the just-completed approval turn reports the already recorded entry when a trusted recent entry is available; after agent reconstruction, it asks whether this is a separate occurrence instead of opening another proposal from transcript text alone.
- A paraphrased request that may repeat a recently completed mocked entry asks whether it is a separate occurrence before another proposal is opened.
- Proposal approval, decline, and replacement create explicit transition records bound to the proposal, user, and action; terminal proposals cannot transition again.
- A clear decline such as “No, not today” also clears a pending goal allocation without recording an allocation.
- A failed ledger write does not produce success wording, leaves the approved action retryable, and a retry with the same user/action ID creates at most one entry even if the first response was lost after persistence.
- Changing a pending proposal's amount, reason, or goal creates a linked replacement proposal and requires fresh approval; unsupported currency edits leave the USD mock-ledger proposal unchanged.
- Approval from another user cannot approve a proposal, and goal allocation cannot reuse the prior proposal's approval.
- Explicit amounts with more than two decimal places or a recognized non-USD currency require clarification and create no proposal or ledger entry; an invalid correction cannot approve the prior pending amount.
- Explicit zero or negative USD amounts require clarification and create no proposal or ledger entry.
- Properly grouped thousands separators in explicit USD amounts parse to exact cents; malformed grouping requires clarification and is never partially interpreted.
- Multiple explicit dollar amounts require clarification unless a recorded-entry correction uses the clear contrast pattern "$18, not $20"; then the first amount is the corrected value and still requires exact approval. Pending proposal edits with multiple amounts cannot be approved until one amount is specified.
- An approval that repeats the pending amount is accepted only when the repeated amount matches the exact pending proposal; a mismatched amount does not approve the old amount.
- Victoria makes it clear when an action is only a mocked ledger entry.

## Agentic Coding Setup

- The headless agent-team prototype routes a turn through typed Financial Moment, Savings Reasoning, and Companion Voice handoffs in order.
- Financial Moment and Savings Reasoning receive bounded relevant user turns, explicitly sourced retrieved memories, provenance-labeled recurring-cost facts, deterministic conditional projections, and a read-only active pending workflow including its linked source-event summary after the source turn leaves the recent dialogue window; they cannot use context as approval or as authority to suggest a projected amount.
- When an avoided-spend amount is missing, specialist context carries a typed `awaiting_amount` state with the validated source event and missing field; it carries no inferred amount, and the orchestrator alone decides whether a user reply resolves it.
- Specialist context receives one selected workflow state; if inconsistent stores expose both a missing-amount clarification and a pending proposal, the confirmation workflow takes precedence.
- Financial Moment and Savings Reasoning receive the same single discriminated `workflowState` field; it is either `awaiting_amount` or `awaiting_confirmation`, with no parallel pending-workflow fields.
- A deterministic reference resolver links an explicit source label such as “that gym membership” only to the active proposal's linked source event; vague pronouns, competing references, and unrelated mentions remain unresolved. The pointer alone cannot approve, revise, or record the pending action.
- A Financial Moment fact-reference hint is accepted only when its exact fact ID and period exist in the supplied typed context; the validated fact reaches Savings Reasoning with provenance and conditions, while the hint alone never supplies a ledger amount or approval.
- While a monthly proposal is pending, a validated reference to its selected annual projection receives an explicit explanation that only the current-month amount is recordable; “12-month projection” and “projection for the next twelve months” resolve as annual, leave the proposal ID and amount intact, and create no entry.
- Orchestration is separated from deterministic handoff validation and final response wording policy.
- Invalid moment output, specialist exceptions, or conflicting savings amounts resolve to a safe clarification/reflection and never to a financial mutation.
- Suggested user-provided amounts must match the validated finding; habit estimates must match the user's own USD habit record.
- The deterministic response policy restores mandatory confirmation, mocked-ledger, and no-transfer disclosures when voice output omits them or falsely claims an action completed.
- Savings Reasoning chooses whether to ask, suggest, or reflect. When it chooses ask, its clarification wording goes directly to the user and Companion Voice does not rewrite it.
- Habit-based savings wording remains explicitly estimated after companion voice drafting.
- The curated specialist readiness corpus preserves expected baseline and advisory-team outcomes for explicit amounts, known estimates, missing amounts, vague savings, regretful spend, transfer requests, and multiple amounts.
- The readiness harness calculates nearest-rank p50/p95 summaries across multiple turns and rejects invalid latency observations; mock timings are not treated as provider SLA evidence.
- The prototype records per-specialist and total elapsed time, the evaluation harness summarizes multi-turn p50/p95, and the orchestrator never invokes more than three specialists in a turn.
- Turn execution has a pure queued/running/completed/failed lifecycle; retries retain the accepted turn identity, and illegal or non-chronological transitions are rejected.
- Turn acceptance replays the original user-scoped idempotent request, rejects reuse with a different conversation or request fingerprint, and compare-and-transition permits only one caller at an expected revision.
- Turn reads and transitions return no data across user/conversation boundaries; the in-memory adapter is explicitly limited to a single process.
- Turn submission rejects unauthenticated callers, hides conversations the caller does not own, validates JSON and idempotency headers, applies body limits, and returns no submitted message in the response.
- PostgreSQL turn storage enforces user-scoped idempotency in the database, replays identical submissions, rejects key reuse with different content, scopes reads by user and conversation, and applies lifecycle transitions under a row lock and expected revision.
- Turn submission fails closed when identity, ownership, request fingerprinting, or repository admission is unavailable; internal errors are not exposed to callers.
- The mock core composition uses Financial Moment classification, validates Savings Reasoning against deterministic estimates, and uses Companion Voice only when its assessment agrees with the core decision.
- The opt-in OpenAI team composition calls each advisory specialist through mocked HTTP in tests, preserves deterministic assessment validation and exact approval in the core, and blocks provider voice claims about real transfers.
- The opt-in local provider-team smoke command loads ignored `.env.local`, uses mock memory and ledger tools, sends no approval, and confirms no ledger entry was created.
- An unsupported or mismatched specialist estimate produces clarification and no proposal; specialist advice never creates a ledger entry or approves an action.
- Approval replies continue through Victoria's pending-action path without re-running specialists; progress, goal, and correction flows stay in their deterministic core handlers.
- Companion Voice wording that shames the user, claims a completed action, or introduces an unsupported money amount falls back to safe deterministic wording.
- Companion Voice wording that promises real money movement or guarantees savings falls back to safe deterministic wording.
- A vague avoided-spend turn can continue through amount clarification to a pending proposal and only create one ledger entry after explicit approval.
- A specialist failure or disagreement with the core estimate does not create a proposal; Companion Voice failure preserves the approval request and mocked-ledger disclosure.
- Low-confidence classification asks for clarification before proposing; a later clear turn can proceed to a pending proposal and requires exact approval.
- A low-confidence clarification retains short-lived context for the next reply, while a clear new intent replaces and clears that context.
- Low-confidence proposal edits leave the pending proposal unchanged; a clear revision creates a superseding proposal that requires fresh explicit approval.
- A classified pending-proposal revision must carry a deterministic reference matching the active action, proposal, and source event; unresolved revisions leave the proposal unchanged, and accepted revisions create a linked replacement requiring fresh exact-action approval.
- A reply to an outstanding revision clarification may use one exact amount-only answer; approximate wording, an unrelated sentence containing an amount, and an ambiguous multi-amount reply must not revise or approve the pending proposal.
- Persistent pending-action storage restores the append-only revision-clarification marker after a VictoriaAgent restart; approval remains blocked until a valid revision amount is supplied or the proposal is declined.
- A revision that appears to target a non-active/older event receives an unsupported-target clarification; an amount-only reply or “yes” cannot retarget or approve the active proposal, including after a runtime restart, and decline remains available.
- Low-confidence goal requests create no allocation; a clarified goal creates a pending allocation that requires explicit approval.
- When a low-confidence goal target is clarified with a different target, the current message takes precedence over stale unresolved context, and only the clarified target is proposed.
- When specialist and core estimates disagree, Victoria asks, accepts the user's clarified amount as a new supported basis, and records only after approval.

- `npm run agent:validate` fails when required agent instructions, task briefs, workflows, PR templates, or CODEOWNERS files are missing.
- `npm run agent:validate` fails when MVP-facing docs drift back toward real money movement language.
- The AI review script skips cleanly when optional and `OPENAI_API_KEY` is missing.
- The AI review script fails when `AI_REVIEW_REQUIRED=true` and `OPENAI_API_KEY` is missing.
- Pull-request AI review runs trusted default-branch code and never executes pull-request code with secrets.
- AI review keeps trusted instructions separate from untrusted diff content.
- Oversized diffs list every changed path, prioritize safety-sensitive excerpts, and cannot satisfy required AI review.
- AI review uses a 2,000-token default per-pass output budget and rejects values outside the bounded range.
- Pull request events trigger AI review through `pull_request_target` using trusted base-branch code; secret-bearing push reviews run only on `main`. Review passes are processed concurrently and adaptively split on output truncation.
- Pull-request AI review paginates changed-file records so diffs over GitHub's 300-file diff endpoint limit still receive complete review. If GitHub omits a large text patch, it retrieves blob data and diffs it against the trusted base without checking out or executing PR code; failure to retrieve either version prevents a partial review.
- Large AI review diffs retain complete coverage; every pass must complete before any review is posted, within the configured bounded call cap.
- GPT-5 AI review requests use low reasoning effort so internal reasoning does not consume the response-token allowance needed for findings.

## Future Integration Boundaries

- The transactions-only profile builder derives user-scoped merchant/category facts from posted USD purchases within 90 days, with provenance, observed dates, sample count, and confidence; pending, stale, malformed, non-USD, and non-purchase transactions are excluded.
- Profile facts contain compact aggregates rather than raw transaction payloads or provider transaction identifiers.
- Persistent profile and conversational facts can be indexed as 1536-dimensional pgvector embeddings; semantic retrieval filters by authenticated user and embedding model, excludes superseded facts, and ignores stale transaction-profile facts.
- If embedding generation or vector search is unavailable, the fact remains persisted and memory retrieval falls back to recent user-scoped facts, including when vector search returns no indexed rows.
- Local persistent chat injects the configured 1536-dimensional OpenAI embedding provider only when a non-placeholder API key is present; without it, recent-fact fallback remains available. Run `npm run eval:memory:relevance` before changing the 0.76 threshold and review precision/recall for relevant paraphrases and unrelated queries.
- Profile-derived context does not approve a savings entry or allocation; exact action approval remains required.

The consent-gated Link bootstrap has executable coverage in [`unit/app/plaid-link-token.test.ts`](unit/app/plaid-link-token.test.ts). Broader financial-profile cases remain pending in [`contracts/financial-profile.pending.test.ts`](contracts/financial-profile.pending.test.ts); convert them to executable assertions as the corresponding bounded interfaces and behaviors are implemented.

- Financial profile setup fetches no Plaid data before explicit user authorization.
- Plaid profile access is limited to the approved read products and purposes; transfer/payment capabilities are unavailable.
- Financial profile data and derived facts remain scoped to the owning user across storage, specialist inputs, and inference context.
- Profile facts preserve source, observation time, freshness, and uncertainty; stale, missing, conflicting, or malformed data cannot be presented as certain current fact.
- `financialprofilespecialist` failures or invalid outputs fall back safely and cannot approve actions, create ledger entries, or trigger transfers.
- Inference receives only relevant bounded profile context and excludes unnecessary raw account identifiers and transaction details.
- Disconnect prevents future fetches/injection and applies the documented retention/deletion behavior.
- Plaid consent grants and revocations are append-only, user-scoped events; a revoke applies only to the exact current grant and repeated revoke is idempotent.
- Re-grant after revocation creates a new event with the newly approved product scope; prior grant and revocation history remain unchanged.
- The consent repository rejects empty/unsupported product scopes and does not reveal another user's current consent.
- Profile-informed savings estimates still require explicit approval before a mocked ledger write.
- Plaid transaction imports normalize merchant names consistently.
- Banking transfer requests are idempotent.
- Failed transfer attempts do not create completed savings entries.
- Notification scheduling respects user preferences.
- Agent tool calls are logged for auditability.
# Plaid transaction profile sync

- The client can create/sign in to a Supabase Auth account, renders only the authenticated connection status, and does not call Plaid Link before fetching the server notice and receiving an explicit confirmation for its current version.
- The client requires the notice to identify Transactions alone and declare balances and transfers disabled before it enables consent or Link; an unsafe notice blocks the flow.
- Client Link-token creation and public-token exchange use authenticated same-origin requests; access tokens and raw transaction rows are never rendered. Disconnect/delete requires a separate user confirmation.
- When the consent endpoint is unavailable, the client shows a recoverable status error and no Plaid data or Link flow.
- Signed-in staging routes return the consent disclosure, accept only a confirmed current consent version, create a Link token only after active Transactions consent, exchange public tokens without returning access tokens, refresh only the authenticated user's profile, and allow authenticated disconnect/delete.
- Plaid routes fail closed unless the staging financial-profile runtime is explicitly enabled with sandbox credentials, Supabase Auth, and a valid encryption key; production and non-sandbox environments never mount it.
- Exchange a Link public token only for the authenticated user with active Transactions consent; never return or persist an unencrypted access token.
- Apply added/modified/removed cursor pages atomically with the cursor and enforce Item ownership.
- Recheck consent between pages; revoked consent blocks provider access and profile refresh.
- Authenticated database clients cannot select encrypted Plaid Item token envelopes; the transaction read model remains user-scoped by RLS.
- The injected Plaid runtime requires explicit opt-in and refuses production and non-sandbox environments.
- Refresh compact 90-day posted USD merchant/category facts only after a complete sync, then persist them as append-only semantic memories.
- Test OpenAI embedding request/response behavior with a mocked fetcher. Do not make live Plaid, OpenAI, or Supabase calls in unit tests.
- Raw transaction rows expire exactly 90 days after the transaction date and cannot enter profile reads after expiry (`LIFE-001`).
- Authenticated Item disconnect and delete-all purge local tokens, cursors, transactions, and derived profile facts/embeddings before remote revocation; delete-all also appends consent revocation (`LIFE-002`, `LIFE-003`).
- Retryable remote revocation failures keep only an encrypted retry record with backoff; permanent provider rejections move the record to manual review; concurrent workers cannot claim the same due Item; success clears it (`LIFE-004`).
- Rotation decrypts configured prior key versions, writes under the active key, verifies persisted ciphertext, and fails closed when a key is missing (`LIFE-005`).
- A foreign Item ID cannot enqueue credentials or trigger deletion of another user's data; local item reads remain user-scoped and ignore disconnected Items (`LIFE-002`).
- Revocation between cursor pages prevents the next Plaid call and prevents profile-memory refresh (`LIFE-006`).
- Lifecycle SQL functions and RLS must be verified against disposable PostgreSQL/Supabase before any live Plaid reads are enabled.

## Memory Orchestration

- The provider extractor is considered for ordinary finance statements, pattern reflections, and unclear turns without an uncertain financial intent, including natural sentence forms the deterministic parser does not recognize; its capture does not replace the ordinary response or a follow-up.
- Natural-statement classification accepts clear first-person context outside the fixed phrase list while questions and spending/action intents keep their existing classification boundaries.
- Provider candidates still require exact in-turn evidence, first-person user attribution, affirmation, stability, ordinary sensitivity, and high confidence; extraction failure does not block the turn.
- Provider extraction is skipped while a savings, goal-allocation, or ledger-correction action is pending, and learning never approves or changes a financial action.
- Changed user memories append a linked current fact; exact repeated evidence is deduplicated.
- Retrieval excludes superseded and stale transaction-profile memories, resolves duplicate keys by source authority, and stays within the configured per-turn bound.
- Financial profile refreshes pass through the memory service, append replacements and absence markers, and invalidate SQLite's short-lived durable-memory cache.
- User-scoped memory retrieval never includes another user's facts.
- A clear conversational correction resolves only to one recent financial fact, appends a linked `user_correction`, and keeps the prior fact in append-only history.
- Correcting one transaction from a rolling Plaid aggregate stores a separate linked transaction-detail fact; it does not rewrite or suppress the aggregate.
- An ambiguous correction asks which purchase/day the user means and creates no memory or financial record.
- A correction during pending savings or ledger-correction approval cannot bypass that approval lifecycle.
- A correction never updates Plaid data, creates a savings proposal, or writes a ledger entry.
- Authenticated memory-management routes expose current memories, append corrections, and append forget suppression markers; they never accept user identity from the request payload.
- Memory inspection returns allowlisted structured details that distinguish user-reported activity amounts, user-confirmed category/merchant mappings, and transaction-profile totals; arbitrary source metadata and provider payload fields are never returned.
- Memory controls can correct an interest into an inactive/new structured fact or update an activity mapping only from a clear first-person statement; transaction-derived profile aggregates reject PATCH and remain forgettable.
- Staging/production chat verifies a bearer token with Supabase Auth, scopes context, facts, approvals, and mock ledger data to the returned subject, and uses durable PostgreSQL storage; the same token scopes memory inspect/correct/forget routes. Missing auth or unsafe runtime configuration fails closed.
- Hosted authorization is owner based: using the same conversation ID, a second verified user cannot read or finish the first user's context, approve that user's pending savings action, or correct/forget that user's memory; foreign memory IDs return the same not-found response as unknown IDs.
- Supabase Auth token verification failure returns unauthorized; Auth service unavailability fails closed without exposing memory.
- Current memory listing is user-scoped, excludes superseded, forgotten, and stale transaction-profile facts, and does not disclose internal source metadata beyond the bounded public contract.
- Memory listing supports bounded keyset pagination; malformed cursors and unsupported query parameters are rejected, and a cursor cannot cross user scopes.
- Corrections are append-only and target only the authenticated user's current fact; unknown and foreign IDs return the same not-found result.
- Forgetting appends a non-embedded marker that suppresses the fact from list and retrieval; source records and embeddings remain retained, and the API states this clearly.
- No bulk-delete endpoint is present. Memory-management routes use Postgres directly and do not depend on Vercel local filesystem persistence.
- An authenticated conversation-finish route summarizes eligible user-authored facts with adjacent assistant prompts only to interpret short replies; assistant text never proves a ledger write. It keeps raw short-term context on failure and returns whether a summary was saved.
- Finishing unchanged context is idempotent; repeated calls do not store duplicate episodes or call the summarizer again.
- Episode summaries can influence only fresh, relevant ordinary reflections and never a financial estimate, approval, or ledger action.

## Durable local memory and savings integrity follow-up

- A paginated current-memory page is returned as produced by storage; the orchestration layer must not apply another lifecycle filter that removes records or shifts a cursor.
- Hydrated durable savings entries and corrections must satisfy the same safe cents, mock-only, approval identity, ownership, and completed-entry checks as newly created records.
- Persisted goal-allocation approval and terminal records must be detached/frozen and limited to valid terminal states. Only an explicit decline of the exact pending action may persist a declined transition.
- Persisted goal-allocation approval snapshots must match both their user and action ID, and restored pending decisions must match their stored owner/action keys.
- PostgreSQL migrations enforce safe-integer cents, user-consistent entry references, goal approval references, a matching recorded transition for each inserted savings entry, and a persisted matching approval for each savings-entry correction.
- Conversation lock contention must stop with a clear timeout instead of waiting indefinitely; clarification expiry is calculated from the database clock.
- Supabase turn and Plaid consent tables must have RLS enabled, no anon/authenticated SELECT grants, and server-role access only.
- A caller-provided deterministic ID factory must not produce duplicate proposal, suggestion, or savings-entry IDs within one agent/tool instance.

# Covered recurring expense planning choices

- A monthly or annual answer to a pending planning-target question advances that same proposal without asking the target question again or creating a ledger entry. The annual amount is conditional planning context; only the current monthly amount can be recorded after a separate explicit confirmation.
- A bare approval to the planning-target question does not authorize a ledger entry. Ask the user to choose a target first.
- A selected target survives restoration of the original append-only pending proposal in another server worker. An ambiguous ledger reply stays pending; a later explicit approval records only the current monthly amount.
- A direct refusal of a pending ledger entry remains a decline when followed by a separate question. The declined proposal is recorded as terminal, no entry is made, and Victoria answers the question without reopening the proposal.
- Ordinary conversational wording cannot offer a new ledger recording, promise real movement, or recommend an investment product; any dollar amount must be in the current message, recent turns, an exact user-provided event amount, or a validated financial fact in the canonical context. A derived projection must retain conditional wording. Memories, unstructured event summaries, and model-written baselines do not authorize amounts. Rejected drafts receive one validated retry, then fall back safely.
- Provider-personalized wording accepts validated monthly cents even when the amount is absent from the text context, allows an empty used-memory list when no memory informed the wording, and rejects negative, non-USD, or over-precise monetary mentions.
- Companion Voice drafts that attribute real transfer capability to Victoria, including second-person phrasing, are rejected while user-directed budgeting suggestions remain allowed.
- Restored covered-expense planning choices require positive safe-integer monthly cents, an exact twelve-month projection, and agreement with the pending mocked-ledger proposal before they can continue toward approval.
- Evidence for a confirmed covered-expense planning observation is bounded and strips control characters before storage.
- An employer-covered recurring bill with an explicit request for Victoria to transfer funds remains a real-money refusal; a budgeting question about redirecting the freed amount remains a planning conversation.
- Covered-expense amounts and Companion Voice amount mentions reject negatives, malformed comma grouping, and more than two decimal places before any suggestion or confirmation.
- Safe target-choice fallback wording presents the monthly and annual figures as conditional planning amounts, not as already available savings.
- A same-message reversal after a direct ledger refusal never counts as approval or a terminal decline; an unrelated follow-up question after the refusal still records a decline.
- When an avoided-spend message combines advice about recording with a record request, the specialist savings path retains control, the responder cannot bypass it, and a separate explicit approval is required before a ledger entry is created.
- With a pending monthly recurring-cost suggestion, a combined annual-projection question and current-month record request gets the conditional yearly calculation plus a fresh confirmation prompt for only the monthly entry; a later “yes” records no projected annual amount.
- A covered-expense turn may save an unrelated, directly stated ordinary preference without attaching the expense to that memory. A generic move or send command without financial context is not classified as a transfer.
- Ledger-confirmation normalization preserves a user-stated goal and accepts an explicit “savings ledger” destination without duplicating the question. The annual fallback uses a named, validated twelve-month projection.
- Direct preference, habit, or goal extraction can use a later user-authored sentence without absorbing adjacent financial context; mixed financial turns still receive their financial response, and provider extraction does not duplicate the same deterministic fact.
- Planning and confirmed-behavior memory use the original scoped user message, not an invented classifier summary. Restored annual planning cents reject overflow, and horizon recovery requires one nonempty source-message match.

# Conversation response and memory continuity

- A brief read-only reply must stay within 450 characters; requests for detail or genuinely multi-part questions may use their larger validated response bands.
- When the user asks for one flexible practical response after pushing back on generic or absolute work-schedule advice, Victoria acknowledges the constraint and offers one concise experiment instead of repeating the baseline or producing a long list.
- A short follow-up such as “make that one sentence” remains anchored to the earlier work-schedule context and cannot switch to unrelated savings or transfer advice.
- An avoided-spend response may acknowledge the user-stated purchase amount, but it must describe the event as avoided spending rather than claim the amount was guaranteed money saved.
- A turn that states a stable preference and asks a question stores only validated user evidence while directly answering the question; it does not return only an acknowledgment.
- When read-only generation fails on a job-change question without pending workflow or validated financial facts, Victoria asks a focused question about the user's decision criteria and creates no savings proposal or ledger entry.
- When read-only generation fails after the user pushes back on an absolute work-time boundary, Victoria acknowledges the constraint, offers one flexible experiment, and asks what feels realistic without creating financial state.
- An unrelated question or read-only financial reflection during a pending mocked ledger action reaches read-only conversation, including a statement without question punctuation; the pending action remains unchanged and a later explicit approval is still required.
- An unpunctuated, read-only first-person reflection about money reaches the conversational responder when classified as general finance; it creates no savings proposal or ledger entry.
- An explicit unpunctuated read-only topic statement reaches the conversational responder without a question mark, while finance-heavy statements and clear recording requests remain on their existing routes.
- When a turn reports an avoided spend and then asks a clearly separated non-financial question, including a semicolon-separated question, one response path answers that question and includes the exact pending ledger suggestion; the companion specialist and general responder must not duplicate each other. A later explicit approval records only that suggestion. Embedded financial questions such as “Should I record it?” are not extracted as independent questions.
- In a live mixed turn containing a clear $24 avoided order and a Sunday scheduling question, the answer should address both topics and request confirmation once; ambiguous assent must not record, while later explicit exact confirmation records one mocked entry. A validated avoided-spend draft must describe the amount as avoided spending, not guaranteed money saved.
- If Financial Moment identifies an avoided purchase but marks clarification needed despite an explicit USD amount in the same purchase sentence, ground that amount only when parsing succeeds and matches any specialist-provided amount; preserve all other clarification conditions and require normal confirmation before recording.
- In a regretful-spend turn that repeats its amount as an anaphoric ledger reference, treat “the $42” as the same amount; keep distinct amounts or repeated amounts tied to separate purchases ambiguous. Answer a separate low-cost meal question without converting regret into avoided savings or creating ledger state.
- When a typed financial context snapshot is supplied to the conversation responder, its separate memory list exactly uses the snapshot's selected, provenance-eligible facts and does not reintroduce inferred memories from raw retrieval.
- The read-only responder receives the canonical provenance-aware financial context; it can use an annual projection only when the typed fact supports the amount and the reply preserves its conditional meaning.
- A retrieved, current, high-confidence user-stated monthly recurring-spend memory may produce a typed monthly fact and linked conditional annual projection; imported-profile values and arbitrary numeric memories remain excluded, and reply validation rejects unqualified or unsupported amounts.
- A directly volunteered stable ordinary fact in a read-only topic shift may be stored even while a financial action is pending, but that learning neither replaces the reply nor changes the pending action.
- After a pending-action topic switch learns a directly volunteered interest, the rebuilt responder snapshot includes that retrievable interest, preserves the pending-action label, and excludes unrelated savings-event history.
- The same memory-refresh contract holds during pending entry-correction and goal-allocation topic switches; both retain their correct action label, keep event history empty, and still require the original explicit approval.
- A pending proposal's read-only topic-switch snapshot preserves its action/proposal/event identity, selected annual planning target as a conditional projection, and distinct monthly recordable amount; the responder cannot change the proposal, and later approval records only the monthly amount.
- A read-only responder turn during a missing-amount clarification receives the exact event's `awaiting_amount` workflow state with no invented amount and no unrelated conversation event history.
- A read-only responder turn while a proposal revision awaits a valid amount receives the active proposal identity and `awaitingValidRevision` marker; an unrelated topic has no active-proposal reference, and “yes” still cannot approve the old amount.
- On an eligible turn with a deterministically extracted fact and a distinct provider-extracted stable fact, both may be stored; provider candidates must retain explicit evidence, stability, sensitivity, and confidence validation, skip exact repeats, and supersede changed prior values.
- Retrying an accepted turn with a changed extraction paraphrase for the same memory category/key must not append a second current fact when both carry the same source turn ID.
- Memory retrieval resolves superseded versions by category/key identity, retaining distinct facts from different categories even when their keys match.
- Structured conversation context, retrieval ranking, and personalized replies share the same user-provenance, confidence, non-future timestamp, inactive-interest, and bounded-evidence eligibility gate.
- Directly extracted user memories without an explicit source type receive `user_statement` provenance consistently across storage adapters; explicit source types are preserved.
- Personalized retrieval caps always-relevant communication preferences at two of six memory slots so topical goals and other facts can rank into the remaining slots.
- Optional memory-learning eligibility must not require a positive match against a fixed list of read-only classifier labels; action intents and uncertain-intent annotations remain excluded.
- A clearly read-only question about prior avoided-spend events during a pending suggestion receives only the bounded event list for the exact user and conversation; it neither approves nor changes the pending proposal. Questions that also ask whether to record, revise, confirm, decline, or otherwise act do not receive this event-history path, with or without a pending proposal, and neither explicit responder event field nor snapshot carries event history.
- A read-only event-history responder snapshot keeps relevant episodic summaries separate from selected current memories and preserves `user_correction` provenance while excluding superseded memory versions.
- A history response receives only events for the exact user and conversation, identically in the explicit responder field, financial context, and immutable snapshot; matching events from other scopes never appear.
- Restoring a pending savings proposal for one conversation must not place its workflow state, event history, or dialogue into another conversation for the same user; the original proposal remains approvable in its owning conversation.
- Pending goal allocations and entry corrections are likewise isolated to the exact owning conversation; another conversation's responder receives no pending label, action details, or source dialogue, while the original action remains explicitly approvable.
- A missing-amount clarification is keyed to the exact user and conversation; an amount-only message in another conversation does not resolve it, while the same amount in the owning conversation completes the original clarification.
- Historical references resolve only over the exact scoped event list: a unique chronology/topic match is selected, ambiguous matches ask a focused question, and unmatched references ask for a merchant or detail. This result is read-only and cannot target corrections or approvals.
- Ambiguous and unmatched historical-event references receive deterministic focused responses even with no pending proposal; a qualifying event-history response receives the same bounded event projection in its explicit fields and immutable context snapshot.
- Conversation response drafts that claim an action, offer to record savings, or introduce an unsupported dollar amount are rejected. A rejected draft gets one validated retry; provider failure or a second rejection retains a safe baseline and cannot create a ledger entry.
- Explicitly detailed requests may receive longer responses than ordinary replies; financial and action validation applies at both lengths.
- OpenAI conversation responder requests use a bounded 256-token brief budget or 1,200-token detailed budget; the matching character validator and financial/action safety checks still apply.
- A derived amount in canonical validated financial facts may appear in a read-only reply only with the required conditional framing when not explicit in the dialogue; unsupported amounts and an unqualified derived projection are rejected.
- An explicit recurring weekly/monthly calculation uses fixed 52-week/12-month cents arithmetic and gives the exact formula and assumptions to the read-only responder; unsupported amounts, balance claims, overflow, and action requests produce no calculation or proposal.
- A read-only responder may include a calculated amount only when it exactly matches verified calculator context; using the result cannot create a proposal, approval, account-balance claim, or ledger entry.
- Conversation reply validation reports schema, style, unsupported-claim, and action-boundary rejection categories separately; fallback observers receive only enumerated reason codes.
- Structured transcript messages preserve schema version, ID, role, content, timestamp, and status through memory adapters; user text beginning with `Victoria:` remains a user message after restart and cannot be reconstructed as assistant speech.
- A 32-case conversation intent regression table covers reflective finance, mixed questions and proposals, recurring-savings calculations, corrections, memory controls, stated goals, and ambiguous confirmation language.
- DialogueState is derived from role-tagged recent turns and resolved references; constraints, corrections, goals, and pending-action identities remain descriptive and cannot grant financial authority.
- Retrieval traces use content-free reason codes for lexical/semantic relevance, recency, corrections, and contextual matches; inactive, future, superseded, or low-confidence facts remain excluded.
- Privacy-safe turn traces report duration and coarse decision outcome without raw user text, dollar amounts, memory values, or hidden reasoning; trace callback failure cannot change the response.
- When the conversation responder fails or both read-only drafts are rejected, the agent uses the deterministic baseline and reports only an enumerated fallback reason to an optional observer; no user message, draft, or provider error text reaches that observer.
- When a job-change question names concern about social time, a deterministic fallback responds to that concern with practical unknowns to ask about, without assuming the user's schedule or introducing financial claims.
- For a no-action ordinary conversation with no validated financial facts or event history, failed response generation can use a topic-specific focused clarification for evenings, groceries, or weekends; pending financial workflows retain their deterministic baseline and later require the same exact approval.
- The review's “I actually want to talk about what the promotion means for my budget” topic switch reaches read-only conversation with a savings proposal pending; the proposal stays unrecorded and a later explicit yes records only its exact amount.
- A configured provider model and key automatically enable financial understanding and conversational generation on the chat route; mock adapters remain test doubles. No user-facing mode selection is needed.


### Conversation-scoped savings event lookup

- A recognized avoided-spend event is stored append-only with its user and conversation identity, including while an amount clarification is pending.
- Reads return events only for the exact user and conversation and preserve stable event identity.
- The Context Builder passes a bounded, provenance-labeled, read-only projection to specialists without treating it as approval or ledger proof.
- Eligible retrieved memories are deduplicated to their newest current fact and ranked for the current message and active workflow before the six-fact context cap; a relevant older correction must outrank newer unrelated facts.
- A same-fact memory with an explicit `supersedesId` link takes precedence over the referenced prior version even when their timestamps tie; similarity to the stale value cannot restore the superseded memory.
- Prompt-context and personalization retrieval use the same deterministic relevance planner while retaining separate category, confidence, provenance, and lifecycle eligibility gates.
- Optional stable-memory extraction runs for eligible read-only savings-progress turns, but skips uncertain, sensitive, forget/correction, and action-oriented intents; extraction never replaces the answer or changes action state.
- Ordinary read-only replies stay concise, while an explicit request to explain, compare, or brainstorm can receive a more detailed response; both styles use the same financial-claim and action validation.
- PostgreSQL lookup is covered across fresh store instances; cross-user and cross-conversation reads return no events.
- Historical natural-language references are resolved only against the exact scoped conversation event list; ambiguous and unmatched references request clarification without creating an action target.
