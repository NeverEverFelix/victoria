# Victoria Decisions

This document records product and technical decisions that shape Victoria.

Use it to keep future development honest. If a coding agent runs into an unresolved product question, it should add the question here or ask the user instead of inventing a major behavior.

## Decided

### MVP Uses A Mocked Savings Ledger

Decision:

The MVP records savings in an internal mocked ledger. It does not move real money.

Why:

The first version needs to prove the behavioral loop before adding banking risk. Users should be able to practice noticing, confirming, and tracking saved money without Victoria needing production bank access.

Implications:

- Victoria can create mocked ledger entries after confirmation.
- Victoria must not claim money was transferred.
- Victoria must clearly explain when savings are only recorded.
- Real transfers remain out of scope for the MVP.

### One-Bank-Account Users Are Supported

Decision:

Victoria should support users who only have one bank account.

Why:

The first user may not have multiple accounts, a separate savings account, or a clean financial setup. Requiring multiple accounts would make the product less approachable.

Implications:

- Saved money may start as a mental and visible separation, not a physical transfer.
- The ledger should help users see what they intended to protect.
- Future versions may add vaults, savings accounts, or transfer integrations.

### Confirmation Is Required Before Recording Savings

Decision:

Victoria must ask for user confirmation before creating a savings ledger entry.

Why:

Saving suggestions involve money-related behavior and should remain user-controlled, even when the action is mocked.

Implications:

- An avoided-spend message can create a pending suggestion.
- A confirmed suggestion can create a mocked ledger entry.
- Approval must match the exact pending action and user, and it cannot be replayed after completion.
- Ambiguous replies must not be treated as approval.
- Declines should be respected without pressure.

### Regretful Spending Is Not Treated As Saved Money

Decision:

Regretful-spend messages should lead to reflection or planning, not automatic savings suggestions.

Why:

The product should avoid shame and should not turn regret into false progress.

Implications:

- "I regret ordering takeout" should not create a savings entry by default.
- Victoria can offer a plan, reminder, or reflection.
- If the user explicitly wants to save an amount after a regretful spend, Victoria should ask for the amount and confirmation.

### Real Money Movement Is Out Of Scope For MVP

Decision:

The MVP must not initiate bank transfers or enable Plaid transfer/payment behavior.

Why:

Real money movement requires stronger approvals, auditing, idempotency, error handling, provider contracts, and production safety checks.

Implications:

- `eventuallyMoveMoney` should remain blocked or unused in MVP flows.
- Plaid financial-data reads are limited to the user-authorized Transactions product for a transaction-history profile. Plaid transfer/payment access and real money movement remain outside the MVP.
- Any future real transfer work needs explicit approval and new tests.

### Memory Evolves While Financial History Remains Immutable

Decision:

Victoria's memory evolves, but historical events, suggestions, approvals, and ledger entries remain immutable.

Why:

Victoria should learn each user's habits and produce better future suggestions without changing the historical record of what it knew, proposed, received approval for, or recorded at an earlier moment. Preserving that record supports user trust, debugging, and auditability.

Implications:

- User habits, learned patterns, and other memory may change over time.
- Historical events, suggestions, approvals, and ledger entries must not be updated in place to reflect newer knowledge.
- A revised estimate creates a new suggestion rather than changing an earlier suggestion.
- A correction, reversal, or superseding action creates a new linked record rather than deleting or overwriting the original.
- Approvals remain bound to the exact historical proposal and user that were approved.

### SQLite Owns Short-Term Context; PostgreSQL Backs It Up

Decision: Confirmed on 2026-10-13. Store short-lived current-conversation clarification context in SQLite first, with a local outbox retrying its PostgreSQL backup. Store durable remembered conversational decisions in PostgreSQL and cache reads in SQLite.

Implications:

- SQLite is authoritative for short-term clarification context; it remains available during a PostgreSQL outage and expires after 30 minutes.
- A SQLite outbox retries the PostgreSQL backup on later context access. This local-first order applies to short-term context; durable decisions still commit to PostgreSQL before refreshing their SQLite cache.
- PostgreSQL can restore unexpired short-term context after the SQLite cache is rebuilt. SQLite is per-process and is not a cross-instance coordination mechanism.
- Current conversation context includes the latest 20 user and Victoria messages, scoped by user and conversation.
- Durable remembered decisions are append-only. Financial events, approvals, and ledger entries remain owned by their separate immutable repositories.
- Durable conversational facts record category, key, value, evidence, confidence, and optional link to a superseded fact. A changed preference appends a new linked fact rather than mutating the old one.
- Victoria automatically records only direct, clear USD savings-amount preferences in this slice; tentative or ambiguous wording is not saved. Remembering a preference never approves a ledger action.
- The extractor also supports direct general preferences, recurring habit statements, and explicit goal statements. Migration `0004_semantic_user_memory.sql` adds Supabase RLS, versioned pgvector embeddings, and a user-scoped semantic search function for these facts and transaction-derived profile facts. Embedding generation is injected and is not configured in the default mock composition; a remembered goal does not authorize a goal allocation.
- This does not yet persist learned habits or goals or select a SQLite file path for a deployed runtime.

### Local Persistent Chat Restores Missing-Amount Clarifications

Decision: The local `VICTORIA_MEMORY_MODE=persistent` runtime stores an unanswered avoided-spend amount clarification in PostgreSQL for the same 30-minute window as short-term conversation context.

Implications:

- Clarification state is scoped by both authenticated local user and conversation ID; another user cannot answer or inherit it.
- The restored state contains the original avoided-spend classification and event. A supplied amount can produce a fresh savings suggestion, which still requires a separate explicit confirmation.
- This does not persist pending proposals, approvals, savings entries, corrections, goal allocations, or cross-process turn locks. Persistent financial chat remains gated on durable proposal/approval and ledger idempotency.

### Recorded Amount Corrections Use Linked Adjustment Records

Decision:

A correction to a completed mocked savings entry appends a signed adjustment record linked to the original. The correction stores the corrected effective amount, signed difference, reason, approval identity, and timestamp. Every correction requires fresh explicit approval.

Why:

This records exactly what changed while preserving the original entry and keeping totals calculable in integer cents.

Implications:

- The original savings entry is never edited or removed.
- A correction can target only a completed mocked entry belonging to the user.
- The effective amount must remain positive; no-op or invalid corrections are rejected.
- Progress totals apply adjustments to their original entry, preserving the entry's reporting week.
- The initial conversation flow targets only a just-recorded entry in the same conversation; otherwise Victoria asks which entry the user means.

### UI Development Comes After The Headless MVP

Decision:

Victoria will not have a user-facing UI or a temporary testing UI until the non-UI MVP behavior and server boundaries are complete.

Why:

The agent loop, approval policy, mocked ledger behavior, domain rules, and API contracts should be correct without relying on a screen to exercise or demonstrate them. Deferring the UI also prevents early visual work from driving unresolved product behavior.

Implications:

- Develop and verify the MVP through unit, integration, contract, and route-handler tests first.
- Do not create Victoria pages, components, layouts, styles, chat sandboxes, developer dashboards, or testing interfaces during the headless phases.
- Frontend dependencies and configuration may be prepared without implementing UI.
- UI implementation becomes the final product phase after the non-UI work queue is complete and `npm run check` passes.
- End-to-end browser journeys and production deployment follow the UI phase.

### Transactions-Only Financial Profile

Decision: Confirmed by the user on 2026-10-13. The first financial profile is built from transaction history only, using user-authorized Plaid Transactions access. Do not include balances, identity data, account metadata, or other Plaid products in this profile.

Scope:

Build a user-scoped financial profile from authorized transaction history. The profile stores compact derived facts such as merchant and category spending patterns with provenance, observation window, sample count, and confidence. Raw transaction payloads are not conversational memory. Profile facts use the same persistent memory and semantic retrieval path as explicit preferences and habits.

Constraints for any future design:

- Request the Transactions product only for this profile; do not include balances, identity data, account metadata, transfer, or payment scopes.
- Profile facts carry provenance, observed time, freshness, and uncertainty, and distinguish source observations from derived inferences.
- Only relevant, bounded context should be injected; raw account identifiers and unnecessary transaction details should not be sent to the conversation agent.
- Profile data is advisory context. The specialist cannot approve actions, create ledger entries, or move money. Existing user confirmation remains required for savings entries.
- User separation, access controls, retention, refresh, disconnect, and deletion behavior must be defined before implementation.
- This scope does not include Plaid transfer or payment capabilities, or real money movement.

The profile input, aggregation, persistence mapping, semantic memory schema, secure Item-token storage, and transaction sync/cursor persistence are implemented. The user confirmed the following lifecycle policy on 2026-10-15:

- Keep raw synced transaction details for 90 days from the transaction date, matching the profile lookback, then purge them.
- Profile facts and embeddings are derived and refreshable. On Item disconnect, immediately disable local access, request remote Item revocation, remove that Item's local token/cursor/transactions, and clear all of the user's Plaid-derived profile facts, embeddings, and linked successor facts; the next authorized sync rebuilds the profile from any remaining Items. On delete-all, revoke the user's Transactions consent and apply that cleanup to every linked Item.
- Preserve a minimal consent revocation audit event. If remote revocation fails, retain only the encrypted token in a retry queue and keep local access disabled. Retry transient failures with backoff; move permanent provider rejections to manual review without discarding the encrypted token. Resume revocation only after the operator has addressed the provider rejection.
- Encrypt Item tokens with versioned AES-256-GCM keys. New writes use the active key; configured prior versions are decrypt-only. Rotate and verify every persisted active or queued token before retiring an old key. Missing keys fail closed.

The maintenance operations are implemented, but scheduling, authenticated route mounting, and live database/provider verification remain deployment tasks. Production Plaid access remains disabled until those gates are completed.

### Typical Merchant Spend Statistic For A Future Provider

Status: Confirmed for transaction-derived merchant estimates and the transactions-only profile.

Use the median of qualifying merchant purchase amounts in integer USD cents. For an even number of purchases, average the two middle values and round a half cent up. Require at least three positive safe-integer amounts. This gives a reproducible typical amount and limits the effect of unusually large purchases. The pure calculation is implemented in `src/domain/financial-events/typical-spend.ts` and covered by `tests/unit/domain/typical-spend.test.ts`.

This decision does not define transaction eligibility, freshness, retention, or the transaction source. Those remain separate provider design gates.

## Open Questions

### Financial Profile Lifecycle And Additional Data

Question:

How should Victoria refresh, retain, delete, and disconnect transaction-derived profile facts, and how should corrections to transaction history be represented?

The user confirmed lifecycle policy on 2026-10-15: raw transactions expire after 90 days; disconnect/delete removes linked transaction data and derived profile facts; remote Item revocation failures are retried while local access stays disabled; and token keys rotate through versioned decrypt-old/encrypt-new migration with verification before retirement. Transaction correction/reconciliation and production enablement remain open. The approved profile scope remains transaction history only; adding another Plaid product requires a new product decision.

Current default:

Build the transactions-only profile within the headless MVP sequence. Live Plaid reads remain blocked on authenticated deployment route composition, scheduled lifecycle jobs, live migration verification, retention/deletion operational checks, and deployment review.

### What Makes Saved Money Feel Protected With One Account?

Question:

If the user has only one bank account, what should make Victoria savings feel meaningfully separate?

Possible answers:

- A visible ledger only.
- A savings goal balance inside Victoria.
- A warning when the user logs spending that conflicts with recent saved amounts.
- A future transfer to a separate account once banking is connected.

Current default:

Use a visible mocked ledger and honest language.

### Should Goals Exist From Day One?

Question:

Should users choose a savings goal in the MVP, or should Victoria start with a generic savings ledger?

Possible answers:

- Start with a generic ledger only.
- Include one default goal, such as emergency fund.
- Let users create simple named goals.

Current default:

Support optional goal language in contracts, but do not make goals required for the first loop.

### How Should Victoria Handle Saved Money That Gets Spent Later?

Question:

If the user records money as saved but later spends it, how should Victoria respond?

Possible answers:

- Treat the ledger as intention tracking only.
- Let the user mark entries as spent.
- Reflect without shame and help reset.
- Eventually compare ledger entries with bank balances.

Current default:

Do not solve this in the MVP. Keep the ledger honest about being a record, not a guarantee.

### What Should Regretful Spending Create?

Question:

When a user regrets spending, should Victoria create a reflection note, a reminder, a suggested plan, or nothing persistent?

Possible answers:

- No persistence in the MVP.
- Store a reflection note.
- Schedule a reminder for similar future situations.
- Convert repeated regret into a habit insight.

Current default:

Respond conversationally without creating a ledger entry. Defer persistence.

### What Language Makes Mocked Savings Feel Honest?

Question:

How should Victoria describe mocked savings so users understand the value without being misled?

Possible answers:

- "I recorded this in your Victoria savings ledger."
- "No real money has moved yet."
- "This is tracked as saved, not transferred."
- "Want to protect this amount by moving it later?"

Current default:

Use direct language: "I recorded this in your Victoria savings ledger. No real money has moved yet."

### Server-Side Memory Management Controls

Decision: Confirmed on 2026-10-17. Provide authenticated server endpoints to inspect, correct, and forget individual current memories. Keep the controls server-side for now; do not add a memory-management UI or bulk-delete endpoint in this slice.

Why:

Users should be able to inspect and correct personalization while the product is still headless. A forget action must stop future recall, but immutable history and derived records should not be silently presented as erased.

Implications:

- `GET/PATCH /api/memories` lists current memories and appends a linked correction.
- `POST /api/memories/{memoryId}/forget` appends a linked suppression marker and excludes the memory from future retrieval.
- Forgetting is retrieval suppression, not physical deletion. Responses must say historical records remain.
- Supabase Auth verifies bearer tokens. The user ID always comes from the verified token, never from request input.
- Vercel memory routes use PostgreSQL directly because local SQLite state is not durable shared storage for serverless functions.
- Bulk deletion, physical deletion/retention policy, and user-facing UI remain future work.

### Vercel And Supabase Memory Runtime

Decision: Confirmed on 2026-10-17. Prepare the production memory API for Vercel with Supabase Postgres and Supabase Auth. Keep the implementation server-side and use a Supabase publishable/anon key only for user-token verification; never use a secret/service-role key for these endpoints.

Implications:

- Database access uses a pooled Postgres connection with one connection per warm function instance.
- Supabase migrations and live row-level-security/vector verification are deployment gates; they are not performed by the local migration runner.
- The current production memory API does not make the local mock chat route production-capable. Persistent financial chat remains gated on durable proposal/approval state.

### Separate Supabase Production And Staging Projects

Decision: Confirmed on 2026-10-17. Keep the existing Victoria Supabase project for production and use a separate hosted Supabase project for staging. Local PostgreSQL remains appropriate for local development and automated tests, not for a remote Vercel preview.

Implications:

- Both projects receive the same versioned schema migrations through Supabase CLI.
- Vercel preview must use the staging Supabase URL and database connection string; production variables must stay scoped to production deployments.
- Staging was created without an explicit compute size. Verify the organization plan and actual project compute/billing in Supabase before relying on it for continuous availability; free-tier projects may pause after inactivity.
- Live endpoint tests must use a synthetic staging account and must not write test data to the production project.

## Decision Process

When adding or changing a decision:

1. State the decision plainly.
2. Explain why it was chosen.
3. List implementation implications.
4. Update related docs if needed.
5. Add or update tests when the decision affects behavior.

Related docs:

- `docs/mvp.md`
- `docs/user-stories.md`
- `docs/agent-work-queue.md`
- `tests/test-plan.md`
- `docs/environments.md`
