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
- A natural-language real-transfer request receives a clear limitation response and does not create a mocked entry or call a transfer tool, including when a savings suggestion is pending; cover sending money to a named goal and withdrawing money from checking.
- Intent classification uses recent conversational context and does not treat colloquial wording such as "move over" as a transfer based on that phrase alone; ambiguous intent asks for clarification.

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
- The route is unavailable outside local development and uses only mock model, memory, and ledger adapters.
- Chat responses are not cached, and the route cannot call Plaid, Supabase, or real money movement providers.
- An explicit user preference shared through one route conversation can shape a later ordinary reply in a different conversation for the same signed user; another user receives no private preference context.
- A pending savings confirmation is bound to its conversation: a bare “yes” elsewhere does not record it, returning to the original conversation can approve it, and a later route visit can read the recorded weekly total.
- A user can correct Victoria's remembered merchant-spend statement through the route; the correction is acknowledged as a separate transaction detail, does not record savings, and does not rewrite the rolling merchant estimate.

- Victoria remembers recurring merchants.
- Victoria updates a habit after repeated similar decisions.
- Victoria retrieves relevant goals before suggesting where savings should go.
- Victoria stores conversation context needed for follow-up questions.
- Victoria avoids using stale or unrelated memory for a new decision.
- Victoria can use updated memory for a future suggestion without rewriting an earlier suggestion.
- PostgreSQL is authoritative for remembered decisions, while SQLite caches those durable reads.
- Current conversation context is short-term SQLite memory, scoped by user and conversation, retaining up to 20 user and Victoria messages; it remains available during a PostgreSQL outage while a local outbox retries its backup.
- The local chat route defaults to mock memory, and `VICTORIA_MEMORY_MODE=persistent` opts into PostgreSQL-backed context and durable memories only under validated local development configuration; persistent mode must not be available in staging or production through this local route.
- Against a dedicated disposable local PostgreSQL database, a memory written through one local chat runtime is recalled by a fresh runtime for the same user, and is not recalled for another user.
- In local persistent chat, an unanswered avoided-spend amount clarification survives a fresh runtime for the same user and conversation; a new amount yields a fresh suggestion requiring explicit approval, and another user cannot retrieve or answer that clarification.
- In local persistent chat, a pending savings proposal survives a fresh runtime; exact confirmation records one immutable `mock_ledger` entry, and weekly progress still includes that entry after another runtime restart. Repeating confirmation cannot create a second entry.
- In local persistent chat, `GET /api/memories` returns only the signed-in local user’s current facts; invalid or absent sessions cannot inspect memory, local forget suppresses listing and future retrieval while retaining its linked historical record; local correction appends a linked current fact and future retrieval uses the correction.
- In local persistent chat, concurrent approval and decline attempts for one proposal serialize to one terminal outcome; a recorded entry cannot coexist with a declined or superseded transition.
- In local persistent chat, simultaneous turns for the same user and conversation execute sequentially across runtime instances; different conversations remain independent.
- PostgreSQL can restore unexpired clarification context after SQLite cache loss, and expired context is not returned.
- Durable conversational memories retain user-stated preferences with evidence and confidence, isolate by user, and supersede earlier facts through linked append-only records.
- Durable conversational decisions are append-only and cannot mutate financial event, approval, or ledger history.
- An injected structured extractor can store at most three stable, ordinary, high-confidence contextual facts only when exact supporting evidence appears in the current user turn; temporary, sensitive, weak-confidence, unsupported, duplicate, or malformed candidates are discarded.
- Extraction rejects quoted/third-party, negated, and hypothetical facts even if the words appear in the user's message; memory-extraction failure does not block the chat turn or bypass proposal/approval policy.
- When the 20-message short-term context is about to roll over, an injected episodic summarizer receives only bounded user-authored messages. It stores a compact append-only summary only when confidence and sensitivity checks pass and each supporting excerpt occurs in the supplied user messages.
- A relevant episode summary can shape an ordinary reflective reply only when it is well-formed, non-future, and at most 90 days old; unrelated and stale episodes are not surfaced.
- Episodic summary failures or unsupported/sensitive summaries do not block the current turn, and the default local runtime does not make extraction-provider calls.
- An explicit “I prefer saving $20 rather than $50 at a time” statement creates an evidence-backed user preference but no savings proposal or ledger entry.
- Tentative, ambiguous, equal-amount, or malformed savings preference statements do not create a memory fact.
- A changed explicit preference appends a fact linked to the prior preference; another user's preference is never returned.
- A direct preference, recurring habit, or stated goal is stored as an evidence-backed structured fact; an identical repeat is deduplicated and an uncertain statement is ignored.
- A relevant retrieved preference or goal shapes an ordinary reflective reply in a later conversation; the response remains user-scoped and cannot create a savings entry or goal allocation.
- A matching remembered coffee, takeout, or merchant routine can shape an ordinary reflection across conversations; unrelated routines and other users' routines stay out, and routine frequency never becomes a money estimate.
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
- Large AI review diffs retain complete coverage; every pass must complete before any review is posted, within the configured bounded call cap.
- GPT-5 AI review requests use low reasoning effort so internal reasoning does not consume the response-token allowance needed for findings.

## Future Integration Boundaries

- The transactions-only profile builder derives user-scoped merchant/category facts from posted USD purchases within 90 days, with provenance, observed dates, sample count, and confidence; pending, stale, malformed, non-USD, and non-purchase transactions are excluded.
- Profile facts contain compact aggregates rather than raw transaction payloads or provider transaction identifiers.
- Persistent profile and conversational facts can be indexed as 1536-dimensional pgvector embeddings; semantic retrieval filters by authenticated user and embedding model, excludes superseded facts, and ignores stale transaction-profile facts.
- If embedding generation or vector search is unavailable, the fact remains persisted and memory retrieval falls back to recent user-scoped facts, including when vector search returns no indexed rows.
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
- Supabase Auth token verification failure returns unauthorized; Auth service unavailability fails closed without exposing memory.
- Current memory listing is user-scoped, excludes superseded, forgotten, and stale transaction-profile facts, and does not disclose internal source metadata beyond the bounded public contract.
- Memory listing supports bounded keyset pagination; malformed cursors and unsupported query parameters are rejected, and a cursor cannot cross user scopes.
- Corrections are append-only and target only the authenticated user's current fact; unknown and foreign IDs return the same not-found result.
- Forgetting appends a non-embedded marker that suppresses the fact from list and retrieval; source records and embeddings remain retained, and the API states this clearly.
- No bulk-delete endpoint is present. Memory-management routes use Postgres directly and do not depend on Vercel local filesystem persistence.

## Durable local memory and savings integrity follow-up

- A paginated current-memory page is returned as produced by storage; the orchestration layer must not apply another lifecycle filter that removes records or shifts a cursor.
- Hydrated durable savings entries and corrections must satisfy the same safe cents, mock-only, approval identity, ownership, and completed-entry checks as newly created records.
- Persisted goal-allocation approval and terminal records must be detached/frozen and limited to valid terminal states. Only an explicit decline of the exact pending action may persist a declined transition.
- PostgreSQL migrations enforce safe-integer cents, user-consistent entry references, goal approval references, and a matching recorded transition for each inserted savings entry.
- Conversation lock contention must stop with a clear timeout instead of waiting indefinitely; clarification expiry is calculated from the database clock.
