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
- Plaid read access for the confirmed financial-profile capability is handled only through its bounded, separately reviewed MVP slice; it cannot enable real transfers.
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
- The extractor also supports direct general preferences, recurring habit statements, and explicit goal statements. These structured facts are source records for a future semantic/vector index; this does not generate embeddings or authorize a goal allocation.
- This does not yet persist learned habits or goals or select a SQLite file path for a deployed runtime.

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

### Financial Profile And Plaid Specialist Are In MVP Scope

Decision: Confirmed on 2026-10-07. Financial profiles built from user-authorized Plaid data, including the `financialprofilespecialist` and relevant profile context injected at inference time, are part of the MVP. Real money transfers remain out of scope.

Scope:

Build a user-scoped financial profile from data the user has authorized Victoria to access through Plaid. A dedicated `financialprofilespecialist` builds or refreshes the base profile and provides relevant context to Victoria at inference time.

Constraints for any future design:

- Authorization, data purpose, and the specific Plaid products/scopes must be clear before access; do not equate “as much data as possible” with appropriate default access.
- Profile facts carry provenance, observed time, freshness, and uncertainty, and distinguish source observations from derived inferences.
- Only relevant, bounded context should be injected; raw account identifiers and unnecessary transaction details should not be sent to the conversation agent.
- Profile data is advisory context. The specialist cannot approve actions, create ledger entries, or move money. Existing user confirmation remains required for savings entries.
- User separation, access controls, retention, refresh, disconnect, and deletion behavior must be defined before implementation.
- This scope does not include Plaid transfer or payment capabilities, or real money movement.

The exact Plaid data products, profile schema, consent flow, and retention schedule remain unresolved. Profile work belongs in the non-UI MVP sequence; UI remains deferred until non-UI work is complete.

## Open Questions

### What Should Victoria's Financial Profile Contain?

Question:

Which user-authorized Plaid data products and metadata are needed to build a useful base profile, and what purposes will each serve?

Open decisions include:

- The minimum necessary Plaid products/scopes for the first profile version.
- Which profile facts are directly observed, derived, or inferred, and how each is represented.
- Freshness thresholds and how stale, missing, or conflicting records affect inference.
- Consent language, connection/disconnection, retention, refresh, deletion, and correction behavior.
- What profile context can be injected into inference and how it is minimized and isolated per user.
- How the specialist is evaluated and how its outputs remain advisory.

Current default:

Do not implement the Plaid/profile slice until these decisions are reviewed and its headless acceptance criteria are defined. The capability itself is confirmed MVP scope.

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
