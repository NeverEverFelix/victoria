# User Learning And Semantic Memory Schema

This schema gives Victoria a persistent, user-scoped record of facts it learns and a vector retrieval path to find relevant facts during a conversation. The `MemoryOrchestrator` coordinates those durable memories with SQLite short-term context and facts derived from the transactions-only financial profile.

The transactions-only profile is an approved read-only product boundary. The default application uses mock memory and does not initialize persistent memory, embeddings, or Plaid reads. Provider-backed runtimes require explicit server-side opt-in, and the Plaid runtime currently rejects every environment except sandbox; live production reads remain disabled. A local pgvector Postgres service is available through Docker Compose for applying and inspecting migrations without Supabase. This document describes the schema and adapter behavior, not a claim that production services are configured.

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

When the Transactions response includes optional metadata, the profile reports per-field coverage for detailed category, canonical merchant ID, and payment channel. Detailed category supersedes the broad category for profile aggregation; payment channel adds an online/in-store/other aggregate. Missing values fall back to broad category and are not inferred.

### `victoria_memory_embeddings`

Stores a versioned 1536-dimensional embedding for a memory fact. The key includes `embedding_model`, so model changes can add a new vector without rewriting the fact or deleting the old vector. The embedding input is a compact `category + key + value` representation, not raw transaction data or private conversation history.

The initial vector width is 1536. The embedding adapter must use one consistent model for both indexing and query vectors and produce exactly 1536 finite values. HNSW cosine search is the initial retrieval index; exact user/model filters remain in the search query.

### `victoria_search_conversational_memories`

The search function returns the most similar current facts for one user and one embedding model. It excludes superseded memories and profile observations whose last observed transaction is older than 90 days. The application also passes the authenticated request's user ID; Supabase RLS independently limits direct authenticated access to `auth.uid()`.

## Retrieval Flow

1. Victoria receives an authenticated user turn and loads its short-term conversation context from SQLite, backed by the PostgreSQL context outbox.
2. `MemoryOrchestrator` asks the durable memory provider for semantically relevant memories for that user.
3. PostgreSQL runs cosine similarity search scoped to the same user and embedding model.
4. The orchestrator removes superseded and stale transaction-profile memories, collapses duplicate keys using source authority, and caps recalled semantic facts at 12 by default.
5. Victoria receives those memories alongside deterministic habits, goals, and recent decisions. Memory is context; it does not approve actions.
6. If embedding or vector search is unavailable, the repository falls back to current persisted memories. The orchestrator still applies freshness and supersession rules.

When a fact is stored and an embedding provider is injected, the repository persists the fact first and then appends its embedding. If indexing fails, the fact remains durable and can be indexed later. `MemoryOrchestrator` deduplicates identical evidence, links changed facts with `supersedes_id`, routes profile refreshes to the profile writer, and invalidates SQLite's user memory cache after a profile update. A completed profile refresh also appends non-embedded absence markers for profile keys no longer present, which supersede old facts without deleting history. Conversational correction is available through Victoria's normal turn flow and authenticated headless memory controls. A correction must resolve to one specific recent financial fact; changed understanding is appended with the user's correction as evidence. A user statement correcting a specific remembered fact supersedes that fact. A correction to one transaction described by an aggregate Plaid or recurring merchant-spend fact is stored as a separate linked transaction-detail fact, so it does not overwrite the rolling aggregate. Ambiguous corrections produce a follow-up question and no memory write. Memory controls list current user-owned facts. Forget selected or all physically removes conversational facts, linked versions, dependent transaction-detail corrections, and embeddings; this is a deliberate privacy exception to ordinary append-only memory history. Plaid-derived profile memories remain managed by the profile disconnect/deletion lifecycle; disconnect also removes linked transaction-detail correction facts and their embeddings so profile-derived context cannot remain retrievable after its source is removed. Pause memory disables learning and personalization from conversational memories while preserving them for review/resumption; it leaves short-term chat context (up to 30 minutes), immutable financial decision history, and separately consented Plaid profile processing in place. Financial events, approvals, and ledger entries are never changed by memory controls. The local mock chat route supports conversational memory review, correction, forget, and pause/resume. Persistent authenticated runtime activation and production login/session issuance remain separate work. The default application still uses mock memory; configuring Supabase, authentication, and live Plaid sync is a later deployment step.

## Safety And Lifecycle

- RLS policies scope memory and vectors to the signed-in Supabase user.
- The application repository always filters by authenticated user ID, including vector search.
- Facts and embeddings are append-only during normal operation. Corrections and updated profile observations link to earlier facts; explicit forget, source disconnect, and scheduled expiry are the documented deletion exceptions.
- A user correction has higher source authority than a transaction-derived observation when both appear in recalled context; a new transaction refresh does not rewrite a user-stated preference.
- Explicit statement patterns and clear conversational corrections are active in the mock runtime. An optional structured memory-extraction adapter supports stable ordinary context from a user turn, with exact-evidence, confidence, user-attribution, assertion, stability, and sensitivity checks before storage. An optional episodic summarizer writes compact, evidence-linked summaries as `other` memories when the 20-message short-term context is about to roll over. Both provider adapters are wired behind a local-only opt-in and remain disabled by default. Memory review, correction, selected forget, Forget all, and Pause/resume are handled as explicit user requests in ordinary chat. Authenticated headless handlers remain for trusted application integrations; users do not manage memories through a separate screen.
- An episodic summary may shape an ordinary reply only when it is validated, no more than 90 days old, not future-dated, and shares at least two meaningful topic terms with the current user message. Episode text is never used to make a financial decision or authorize an action.
- `source_metadata` contains only compact derived fields; it must not contain raw provider payloads, access tokens, or account identifiers.
- Transaction-profile facts are limited to the transactions-only product decision and the existing 90-day profile window.
- Embeddings are derived personal data and must follow the same access, retention, and deletion policy as their source fact.
- User-stated preferences, habits, goals, and conversational corrections persist until the user forgets the selected lineage or uses Forget all. Superseded conversational records remain available as history but are excluded from retrieval; selected forget removes the full linked lineage and its embeddings.
- Episodic summaries expire after 90 days from creation. Current transaction-profile facts expire 90 days after the last observation; linked corrections are removed with the stale source. A fresh profile fact keeps its superseded history until profile disconnect or deletion.
- Expiration runs through the service-role lifecycle job. Fact and embedding deletion occurs in the same database transaction. Profile disconnect remains an immediate purge, independent of the scheduled expiration job.
- A memory or profile fact is context only. It never approves a savings entry, goal allocation, transfer, or other action.

## Deferred Deployment Work

- Apply the migrations locally against the Docker pgvector service and inspect extension, index, RLS, and function behavior before preparing a Supabase deployment.
- Apply migration `0004_semantic_user_memory.sql` in Supabase after enabling pgvector in the `extensions` schema.
- Configure a concrete 1536-dimensional embedding provider and inject it into the durable memory repository.
- Verify the migration, RLS policies, function grants, vector index, and query plan in the target Supabase project.
- Verify the defined user-stated, episodic, and transaction-profile retention policies and embedding deletion against the target Supabase project.
- Apply migration `0005_plaid_transaction_sync.sql` for encrypted Item envelopes, cursor state, and the minimal sync read model; wire the opt-in sync service to `rememberFinancialProfile`.
- Apply migration `0006_plaid_transaction_metadata.sql` for optional detailed category, merchant entity ID, and payment-channel fields.
- A signed-session chat route is mounted for local development using mock adapters. Trusted login/session issuance, persistent runtime activation, live Supabase verification, scheduled retention-job operation, and key rotation are not yet complete.
