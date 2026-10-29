# User Learning And Semantic Memory Schema

This schema gives Victoria a persistent, user-scoped record of facts it learns and a vector retrieval path to find relevant facts during a conversation. The `MemoryOrchestrator` coordinates those durable memories with SQLite short-term context and facts derived from the transactions-only financial profile.

The transactions-only profile is an approved read-only product boundary. The default application uses mock memory and does not initialize persistent memory, embeddings, or Plaid reads. Provider-backed runtimes require explicit server-side opt-in, and the Plaid runtime currently rejects every environment except sandbox; live production reads remain disabled. This document describes the schema and adapter behavior, not a claim that production services are configured.

## Records

### `victoria_conversational_memories`

One immutable row per learned fact:

- `user_id`: owning application user. Every read and write is scoped by this value.
- `category`, `memory_key`, `value`: structured fact identity and useful statement.
- `evidence`, `confidence`: why Victoria believes the fact and how certain it is.
- `source_type`: direct user statement, Plaid transaction profile, system inference, or user correction.
- `observed_from`, `observed_through`, `source_record_count`, `source_metadata`: optional source window and bounded provenance for derived profile facts.
- `supersedes_id`, `created_at`: append-only history when a newer understanding replaces an older one.

For the financial profile, merchant and category aggregates are stored as `financial_pattern` facts. Evidence records the number and date window of qualifying posted USD purchases. Raw transaction payloads, provider transaction IDs, and account identifiers do not become memory evidence. A profile refresh appends a linked fact when the value or observation window changes.

Ordinary hobbies and interests use `other` facts keyed as `interest:<activity>`. A clearly listed set of up to eight activities creates separate facts with shared source evidence, so correction and retrieval stay activity-specific. A clear first-person correction that the user no longer enjoys an activity appends a linked inactive-interest record. User-reported recurring hobby spend uses `financial_pattern` facts keyed as `interest_spend:<activity>` and records the explicit USD amount and cadence in the value/compact metadata. The deterministic parser requires a recurring period; it does not turn one-time costs, amounts with no period, or provider guesses into a recurring spend fact. One message may create independent facts for several activities when each amount, activity, and cadence is explicit; every fact retains the full original user statement as evidence. Mapping extraction accepts additional clear first-person categorization and merchant-link phrasings, but does not infer a link from questions or guesses. A spend reply attributes the amount to the user and invites correction. A transactions-only category or merchant can support an activity spend reply when its normalized key exactly matches the activity or when the user explicitly maps that category/merchant to the activity. The response identifies the mapping, posted-purchase count, and profile date window; it does not infer a broad related category. User-reported recurring amounts remain a separate source and take precedence only as the user's stated estimate, with attribution.

Monthly-versus-annual allocation choices are scoped to the covered expense in the current conversation and are not `preference` facts. After the user explicitly confirms a mocked ledger entry for an employer-covered recurring expense, Victoria may append one `financial_pattern` fact keyed `observed_behavior:covered_recurring_expense_to_savings`. Its compact semantic value describes the observed behavior and chosen horizon; metadata tracks the last horizon, monthly/annual observation counts, and total observations. A new observation supersedes the current fact while retaining history. One observation can be recalled only as a prior example. A horizon tendency is available only after at least two observations and only when the counts differ. This memory can inform a similar future conversation but cannot select the horizon, authorize an action, or claim real money moved.

When the Transactions response includes optional metadata, the profile reports per-field coverage for detailed category, canonical merchant ID, and payment channel. Detailed category supersedes the broad category for profile aggregation; payment channel adds an online/in-store/other aggregate. Missing values fall back to broad category and are not inferred.

### `victoria_memory_embeddings`

Stores a versioned 1536-dimensional embedding for a memory fact. The key includes `embedding_model`, so model changes can add a new vector without rewriting the fact or deleting the old vector. The embedding input is a compact `category + key + value` representation, not raw transaction data or private conversation history.

The initial vector width is 1536. The embedding adapter must use one consistent model for both indexing and query vectors and produce exactly 1536 finite values. HNSW cosine search is the initial retrieval index; exact user/model filters remain in the search query.

### `victoria_search_conversational_memories`

The search function returns the most similar current facts for one user and one embedding model. It excludes superseded memories and profile observations whose last observed transaction is older than 90 days. The application also passes the authenticated request's user ID; Supabase RLS independently limits direct authenticated access to `auth.uid()`.

## Retrieval Flow

1. Victoria receives an authenticated user turn and loads its short-term conversation context from SQLite, backed by the PostgreSQL context outbox.
2. `MemoryOrchestrator` asks the durable memory provider for semantically relevant memories for that user.
3. PostgreSQL runs cosine similarity search scoped to the same user and embedding model and returns each candidate's cosine score for conservative relevance checks.
4. The orchestrator removes superseded and stale transaction-profile memories, collapses duplicate keys using source authority, and caps recalled semantic facts at 12 by default.
5. Victoria receives those memories alongside deterministic habits, goals, and recent decisions. Memory is context; it does not approve actions.
6. If embedding or vector search is unavailable, the repository falls back to current persisted memories. The orchestrator still applies freshness and supersession rules.

When a fact is stored and an embedding provider is injected, the repository persists the fact first and then appends its embedding. If indexing fails, the fact remains durable and can be indexed later. `MemoryOrchestrator` deduplicates identical evidence, links changed facts with `supersedes_id`, routes profile refreshes to the profile writer, and invalidates SQLite's user memory cache after a profile update. A completed profile refresh also appends non-embedded absence markers for profile keys no longer present, which supersede old facts without deleting history. Conversational correction is internal to Victoria's normal turn flow. A correction must resolve to one specific recent financial fact; changed understanding is appended with the user's correction as evidence. A user statement correcting a specific remembered fact supersedes that fact. A correction to one transaction described by an aggregate Plaid or recurring merchant-spend fact is stored as a separate linked transaction-detail fact, so it does not overwrite the rolling aggregate. Ambiguous corrections produce a follow-up question and no memory write.

The server-side memory controls are paginated `GET/PATCH /api/memories` and `POST /api/memories/{memoryId}/forget`. Listing accepts a maximum page size of 100 and an opaque keyset cursor. Routes require a Supabase Auth-verified bearer token. Listing and mutation scope comes only from the verified Supabase user ID. The public listing includes an allowlisted `details` projection for user-reported activity spend, user-confirmed activity mappings, and transaction-profile aggregates; it does not return arbitrary `source_metadata`, provider payloads, or internal linked profile keys. Correction appends a linked `user_correction`; structured interest, recurring-activity-spend, and activity-mapping corrections require a clear first-person statement and are re-extracted into structured facts. Transaction-derived profile aggregates are read-only through correction controls. Forgetting appends a linked, non-embedded marker which suppresses the selected fact from current retrieval immediately; after a 30-day recovery window, the scheduled retention routine physically deletes the marker, its source fact lineage, and their embeddings. A new fact that explicitly supersedes the forget marker restores recall during that window. There is no bulk-delete route or memory UI. Hosted chat and memory routes use PostgreSQL directly rather than local SQLite.

## Safety And Lifecycle

- RLS policies scope memory and vectors to the signed-in Supabase user.
- The application repository always filters by authenticated user ID, including vector search.
- Facts and embeddings are append-only. Corrections and updated profile observations link to earlier facts.
- A user correction has higher source authority than a transaction-derived observation when both appear in recalled context; a new transaction refresh does not rewrite a user-stated preference.
- Interest personalization uses an exact topic/known alias or a cosine similarity score of at least 0.76, and still requires a concrete planning, routine, goal, or spending cue. Recalled user-reported spend and transaction-category totals disclose their source and invite correction; routine frequency or inferred interest never becomes an amount estimate. The threshold is still provisional: run `npm run eval:memory:relevance` against the labeled synthetic cases in `tests/evaluation/memory-relevance-cases.json` and review precision/recall before treating 0.76 as calibrated.
- Explicit statement patterns and clear conversational corrections are active in the mock runtime. Structured provider extraction and episodic summarization are enabled by default with a real model and key, unless their respective `OPENAI_*_ENABLED=false` flags disable them. Provider extraction considers ordinary and pattern reflections, avoided-spend and regretful-spend turns, and non-financially-uncertain unclear turns; it excludes pending approval/correction and real-money-movement requests. It can retain up to eight facts per turn, subject to exact-evidence, confidence, user-attribution, assertion, stability, and sensitivity checks. Extraction failures preserve the ordinary response and emit a privacy-safe operational signal. Episodes write compact, evidence-linked summaries as `other` memories only when the 20-message short-term context rolls over or a conversation is explicitly finished; ordinary turns do not invoke the summarizer. The mock model and placeholder key in the example configuration make no provider calls. Users can manage current durable facts through the server-only controls described above; no general memory UI or bulk delete exists.
- An episodic summary may be created when the short-term window rolls over or when the authenticated client explicitly finishes a conversation; ordinary turns do not trigger episode creation. It may shape an ordinary reply only when it is validated, no more than 90 days old, not future-dated, and either has a cosine similarity score of at least 0.76 for the current query or shares at least two meaningful topic terms across its summary and evidence. Episode text is never used to make a financial decision or authorize an action. The 0.76 threshold is a conservative initial setting and still needs hosted relevance evaluation.
- `source_metadata` contains only compact derived fields; it must not contain raw provider payloads, access tokens, or account identifiers.
- Transaction-profile facts are limited to the transactions-only product decision and the existing 90-day profile window.
- Embeddings are derived personal data and must follow the same access, retention, and deletion policy as their source fact.
- Unforgotten ordinary conversational facts expire after 24 months without a newer linked revision. The whole fact lineage and all vectors are purged together.
- Reads enforce the 24-month cutoff even when the scheduled physical purge is late.
- Forgotten facts are suppressed immediately and physically purged after 30 days. Daily Supabase backups may retain the deleted primary rows until the backup snapshot expires; projects must set backup/PITR retention to at most 30 days. Therefore the maximum expected residual-copy period is 60 days from a forget request.
- Short-term context is logically unavailable after 30 minutes; hosted context rows are physically removed by daily retention maintenance. Local SQLite cache/outbox rows expire after 30 minutes and are swept at startup, on access, and every minute.
- Financial decisions, approvals, and ledger history remain under their separate immutable history policy.
- A memory or profile fact is context only. It never approves a savings entry, goal allocation, transfer, or other action.

## Retention And Operational Maintenance

Migrations `0018_memory_retention_and_operations.sql` and `0019_expire_stale_memory_recall.sql` add `victoria_run_memory_retention(now())` and the restricted `victoria_retention_runs` audit table. The routine removes expired context, reuses the 90-day Plaid cleanup, and deletes expired/forgotten memory lineages with their vectors in one transaction. Migration 0019 also enforces the 24-month cutoff inside semantic search. The scheduled `/api/cron/memory-retention` route requires a constant-time checked `CRON_SECRET`; Vercel production invokes it daily at 03:30 UTC. SQL run status and deletion counts are auditable. See [the lifecycle and recovery runbook](../operations/memory-lifecycle-and-recovery.md).

## Remaining Deployment Work

- Run the labeled memory-relevance evaluation on the selected embedding model and retain its threshold metrics with the release review. Synthetic cases are a starting set; add reviewed, de-identified paraphrases and unrelated examples before changing the threshold.

- Apply migration `0004_semantic_user_memory.sql` in Supabase after enabling pgvector in the `extensions` schema.
- Configure a concrete 1536-dimensional embedding provider and inject it into the durable memory repository.
- Verify the migration, RLS policies, function grants, vector index, and query plan in the target Supabase project.
- Verify the configured backup/PITR retention in the Supabase dashboard and configure a staging scheduler and production Vercel `CRON_SECRET`.
- Apply migration `0005_plaid_transaction_sync.sql` for encrypted Item envelopes, cursor state, and the minimal sync read model; wire the opt-in sync service to `rememberFinancialProfile`.
- Apply migration `0006_plaid_transaction_metadata.sql` for optional detailed category, merchant entity ID, and payment-channel fields.
- Migrations `0010`–`0019` are applied to the linked staging Supabase project; migration parity and a zero-delete retention smoke run were verified. Authenticated chat/memory endpoint smoke tests still require a deployed app URL and signed-in staging user. Production migrations `0009`–`0019`, trusted client sign-in, Vercel configuration, backup retention verification, and Plaid lifecycle live verification remain outstanding.
