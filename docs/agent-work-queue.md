# Agent Work Queue

This file gives coding agents a prioritized list of small implementation slices.

## Conversational Memory Storage Slice

Status: SQLite 20-message short-term context store, PostgreSQL outbox backup, durable evidence-backed conversational memory, conservative extraction for explicit savings preferences, recurring habits, and stated goals, and conversational transaction-detail correction are implemented. Transactions-only profile aggregates map into the same append-only memory store. Migration `0004_semantic_user_memory.sql` adds Supabase RLS, versioned pgvector embeddings, and semantic retrieval; the repository calls retrieval when an embedding provider is injected. Quantified merchant-spend memory informs same-merchant estimates, including amounts supplied after a clarification. Recurring habits explicitly tied to named merchants are stored under merchant-specific keys, independently from generic category habits; Victoria can reference the matching routine when asking for a missing amount, then remember the user's answer as a separate spend fact. Merchant-spend extraction supports both “I usually spend $6 at Blue Bottle” and “My usual spend at Blue Bottle is around $6”. A signed-session chat route is mounted for local development with mock model, memory, and ledger adapters only. Trusted login/session issuance, durable runtime wiring, Supabase migration verification, and goal integration into the savings domain remain open. Users do not review or edit memory through a separate interface.

- PostgreSQL stores append-only remembered decisions and backs up current context.
- SQLite owns short-term context first; it expires after 30 minutes and retries PostgreSQL backup through an outbox.
- Context retains up to 20 user and Victoria messages and is scoped by user and conversation; durable fact reads use the SQLite cache.
- Explicit statements such as “I prefer saving $20 rather than $50 at a time,” “I usually make coffee at home on weekdays,” and “My goal is to save $1,000 for a trip to Japan” create evidence-backed facts; uncertain statements do not.
- Recurring actions explicitly tied to a merchant (for example, ordering lunch from DoorDash on Fridays) use a merchant-specific memory key; changing one merchant's pattern does not replace another merchant's or the generic category habit.
- Structured facts and transactions-only profile aggregates share a durable PostgreSQL memory store with a pgvector embedding table and user-scoped semantic retrieval function. A concrete OpenAI embedding adapter and explicit Supabase-compatible runtime are implemented; the default runtime remains mock-backed and no project or credentials are configured.
- A mock-only bridge maps built transaction profiles into the existing transaction-history estimate seam. Victoria can propose a fresh, sufficiently sampled merchant estimate, disclose its source, and wait for explicit approval; undersampled profiles ask the user for an amount. Durable runtime and live provider wiring remain deferred.
- An optional structured memory extractor can learn stable ordinary context from a user turn. Victoria stores only high-confidence candidates with exact user-attributed, affirmed evidence from that turn, marked stable and non-sensitive. An optional episodic summarizer appends a compact evidence-linked summary when short-term context reaches its 20-message limit. Both adapters are wired behind `OPENAI_MEMORY_EXTRACTION_ENABLED=true` for local development and remain disabled by default.
- Before production use, configure the SQLite database path/runtime lifecycle and verify migrations `0003_conversational_memory.sql` and `0004_semantic_user_memory.sql` against Supabase/PostgreSQL with pgvector enabled.

Agents should work from the top unless the user explicitly chooses a different item. Each slice should be completed with tests and verified with `npm run check`.

## Working Rules

- Read `AGENTS.md` before starting.
- Read the linked user story before coding.
- Prefer one slice per change.
- Write or update tests before implementation when practical.
- Keep mocked ledger behavior separate from real money movement.
- Do not add external integrations unless a separately approved slice explicitly asks for them. Plaid access is limited to the approved Transactions-only profile; real money movement remains prohibited.
- Update docs when behavior changes.

## Slice 1: Avoided Spend With Explicit Amount

Source story: `docs/user-stories.md` Story 1

Goal:

Victoria should recognize an avoided-spend message with a clear dollar amount and suggest recording that amount as saved.

Example:

```text
I almost bought a $90 jacket but decided to wait.
```

Expected behavior:

- Classifies the message as `avoided_spend`.
- Uses the user-provided amount.
- Creates a savings suggestion for 9000 cents.
- Requires approval before creating a ledger entry.
- Does not claim real money moved.

Likely test area:

- `tests/unit/agent/victoria-agent.test.ts`

Likely code area:

- `src/agent/victoria-agent.ts`
- `src/agent/llm/mock-llm.ts`
- `src/agent/tools/mock-tools.ts`

Done when:

- A test covers the explicit amount flow.
- The response includes a savings suggestion.
- No ledger entry is created before approval.
- `npm run check` passes.

## Slice 2: Vague Savings Moment

Source story: `docs/user-stories.md` Story 4

Goal:

Victoria should ask a follow-up question when the user says they saved money but does not provide enough detail.

Example:

```text
I saved money today.
```

Expected behavior:

- Classifies the message as `unclear`.
- Asks what the user avoided or changed.
- Does not guess a merchant or amount.
- Does not create a savings suggestion.
- Does not create a ledger entry.

Likely test area:

- `tests/unit/agent/victoria-agent.test.ts`

Likely code area:

- `src/agent/victoria-agent.ts`
- `src/agent/llm/mock-llm.ts`

Done when:

- A test covers the vague message flow.
- Victoria asks a follow-up question.
- No tool call is requested.
- `npm run check` passes.

## Slice 3: Confirm Suggested Savings

Source story: `docs/user-stories.md` Story 6

Goal:

Victoria should create a mocked ledger entry only after the user confirms a pending savings suggestion.

Example:

```text
Victoria:
Want to record $27 as saved?

User:
Yes.
```

Expected behavior:

- Requires an existing pending savings suggestion.
- Recognizes approval through the approval path.
- Creates a mocked ledger entry.
- Includes amount, reason, movement mode, and approval context.
- Preserves the event, suggestion, approval, and ledger entry as immutable historical records.
- Communicates that the amount was recorded in the Victoria ledger.

Likely test area:

- `tests/unit/agent/victoria-agent.test.ts`
- `tests/unit/agent/policy.test.ts`

Likely code area:

- `src/agent/victoria-agent.ts`
- `src/agent/policy.ts`
- `src/agent/tools/mock-tools.ts`

Done when:

- A test proves approval creates a ledger entry.
- A test proves no pending suggestion means no entry is created.
- A test proves later memory changes cannot rewrite the approved historical records.
- Mocked ledger entries remain separate from real money movement.
- `npm run check` passes.

## Slice 4: Avoided Spend Without Known Amount

Source story: `docs/user-stories.md` Story 2

Goal:

Victoria should handle avoided-spend messages that do not include a dollar amount.

Example:

```text
I cooked instead of ordering DoorDash.
```

Expected behavior:

- Classifies the message as `avoided_spend`.
- Looks for a known merchant or habit amount.
- Suggests that amount when available.
- Asks a follow-up question when no estimate is available.
- Requires approval before recording savings.

Likely test area:

- `tests/unit/agent/victoria-agent.test.ts`
- Future memory/tool tests if needed.

Likely code area:

- `src/agent/victoria-agent.ts`
- `src/agent/llm/mock-llm.ts`
- `src/agent/memory/mock-memory.ts`
- `src/agent/tools/mock-tools.ts`

Done when:

- A test covers known habit amount.
- A test covers missing amount fallback.
- No ledger entry is created before approval.
- `npm run check` passes.

## Slice 5: Regretful Spend Reflection

Source story: `docs/user-stories.md` Story 5

Goal:

Victoria should respond to regretful spending without shame and without treating the spend as savings.

Example:

```text
I regret ordering takeout last night.
```

Expected behavior:

- Classifies the message as `regretful_spend`.
- Responds with a nonjudgmental reflection.
- Does not suggest recording savings by default.
- Does not create a ledger entry.

Likely test area:

- `tests/unit/agent/victoria-agent.test.ts`

Likely code area:

- `src/agent/victoria-agent.ts`
- `src/agent/llm/mock-llm.ts`

Done when:

- A test covers regretful spend.
- The response is nonjudgmental.
- No savings suggestion or ledger entry is created.
- `npm run check` passes.

## Slice 6: Decline Suggested Savings

Source story: `docs/user-stories.md` Story 7

Goal:

Victoria should let the user decline a pending savings suggestion without pressure.

Expected behavior:

- Recognizes a decline for a pending suggestion.
- Does not create a ledger entry.
- Returns a lightweight response.
- Does not pressure the user.

Likely test area:

- `tests/unit/agent/victoria-agent.test.ts`

Likely code area:

- `src/agent/victoria-agent.ts`
- `src/agent/policy.ts`

Done when:

- A test proves decline does not create a ledger entry.
- Victoria responds respectfully.
- `npm run check` passes.

## Slice 7: Weekly Mocked Savings Progress

Source story: `docs/user-stories.md` Story 8

Goal:

Victoria should summarize confirmed mocked ledger entries for the current week.

Expected behavior:

- Sums confirmed mocked ledger entries for the current week.
- Excludes pending, declined, canceled, or previous-week entries.
- Formats the total clearly.
- Routes a weekly progress question through a read-only agent tool call.
- Uses Monday 00:00 UTC as the current week's start until user-local timezone support exists.
- Does not imply real money moved.

Likely test area:

- `tests/unit/domain/`
- Future `tests/integration/ledger/`

Likely code area:

- `src/domain/`
- `src/agent/tools/mock-tools.ts`

Done when:

- Domain tests cover weekly total calculation and exclude pending, canceled, and previous-week entries.
- Agent tests cover the read-only tool call, user-scoped total, empty-week response, and mocked-ledger wording.
- `npm run check` passes.

## Slice 8: Goal Allocation

Source story: `docs/user-stories.md` Story 9

Goal:

Victoria should attach a savings goal to a pending or confirmed mocked savings entry when context is clear.

Expected behavior:

- Recognizes a goal-allocation request.
- Uses a pending savings suggestion or a just-confirmed entry in the same conversation when available.
- Asks a follow-up question when context is unclear.
- Does not move real money.
- Records an approved goal allocation as a new immutable record linked to a completed entry.
- Leaves the original savings entry unchanged.

Likely test area:

- `tests/unit/agent/victoria-agent.test.ts`
- Future memory tests.

Likely code area:

- `src/agent/victoria-agent.ts`
- `src/agent/memory/`
- `src/agent/tools/`

Done when:

- Tests cover goal allocation on pending suggestions and confirmed entries, with approval bound to the updated destination.
- Adding a goal to a pending suggestion creates a linked replacement proposal with a fresh approval action.
- A test covers unclear context.
- The confirmed entry remains unchanged and the allocation record is linked to it.
- `npm run check` passes.

Recent-entry context is limited to a confirmed entry in the same conversation. When that context is unavailable, Victoria asks which amount the user means.

## Slice 9: No Real Money Movement Boundary

Source story: `docs/user-stories.md` Story 10

Goal:

Victoria should clearly refuse or redirect real money movement requests in the MVP.

Example:

```text
Move the money now.
```

Expected behavior:

- Explains that the MVP can only record savings.
- Does not call `eventuallyMoveMoney`.
- Offers mocked ledger recording if appropriate.
- Preserves a clear boundary between mocked and real movement.
- Recognizes natural-language transfer requests and does not treat them as approval for a pending mocked entry.

Likely test area:

- `tests/unit/agent/policy.test.ts`
- `tests/unit/agent/victoria-agent.test.ts`
- `tests/unit/config/feature-flags.test.ts`

Likely code area:

- `src/agent/policy.ts`
- `src/agent/victoria-agent.ts`
- `src/config/feature-flags.ts`

Done when:

- Agent tests cover a direct transfer request with and without a pending savings suggestion.
- Neither path creates an entry or requests a real transfer tool.
- Tests prove real transfer tools are blocked in MVP conditions.
- Victoria's message is clear and honest.
- `npm run check` passes.

## Slice 11: Show Weekly Progress After Saving

Source story: `docs/user-stories.md` Story 6

Goal:

After a confirmed entry is recorded, Victoria should show how it changes the user's current-week mocked-ledger total.

Expected behavior:

- Read the completed current-week total after a successful ledger write.
- Clearly describe the amount as recorded in the mocked Victoria ledger.
- If the read-only summary fails, still confirm the successful write and say the total is unavailable.
- A summary failure must not make the user retry the already completed savings action.

Done when:

- Tests cover a successful progress summary and a failed summary lookup after successful recording.
- `npm run check` passes.

## Slice 12: Validate Cents At The Ledger Boundary

Source rule: `docs/specification/mvp-safety-contract.md` rule AMT-001

Goal:

The mocked ledger should reject invalid monetary values even if they bypass conversational amount parsing.

Expected behavior:

- Accept only positive safe integer amounts expressed in USD cents.
- Reject zero, negative, fractional, non-finite, and unsafe integer values before creating an entry.
- Leave the ledger unchanged after rejection.

Done when:

- Contract tests cover invalid amount shapes at the tool boundary.
- `npm run check` passes.

## Backlog Notes

## Slice 17: Consent-Gated Plaid Link Bootstrap

Status: Consent-gated Link creation, public-token exchange, encrypted Item-token persistence, cursor-based Transactions sync, profile refresh, 90-day retention cleanup, authenticated disconnect/delete-all handling, remote revocation retry queue, and versioned token-key rotation are implemented behind injected server handlers and an explicit runtime factory. The factory requires explicit opt-in and currently rejects non-sandbox Plaid environments. Lifecycle scheduling, production route mounting, live database/provider verification, and key retirement operations are not configured; no live verification was performed.

Goal:

Start the user-authorized Plaid connection flow and refresh the transactions-only financial profile after link completion.

Expected behavior:

- Require a verified user identity from an injected authentication boundary.
- Load consent for that authenticated user; do not accept identity or product scope from the request body.
- Create a short-lived Link token only for the active consent record's supported read products.
- Reject unsupported payment/transfer products and fail closed on consent/provider errors.
- Select the Plaid API environment explicitly; never return credentials or access tokens to the client.
- Persist cursor deltas atomically, then derive and store compact financial-profile facts after a complete sync.

Implemented files:

- `src/app/plaid/create-link-token-handler.ts`
- `src/app/plaid/plaid-link-token-client.ts`
- `tests/unit/app/plaid-link-token.test.ts`

The transactions-only read-only profile scope is approved. Production Plaid access and money movement remain disabled. Remaining deployment work includes:

- Apply migration `0002_plaid_consent_events.sql` and verify behavior against a live PostgreSQL database.
- Mount the handlers behind the application's verified session.
- Apply and verify migrations against the selected PostgreSQL/Supabase project.
- Mount the authenticated disconnect handler and schedule expiry, revocation retry, and key-rotation maintenance operations.
- Provide an authenticated operator workflow to resolve and resume encrypted `manual_review` revocation records before live reads are enabled.
- Verify migration `0007_plaid_data_lifecycle.sql` and lifecycle operations against a disposable PostgreSQL/Supabase database.
- Run a controlled key rotation and verify all active and queued Item tokens before retiring prior keys.
- Lifecycle unit and contract tests cover 90-day expiry/filter boundaries, user-scoped deletion, revoked consent during pagination, concurrent-safe provider retry claims, permanent-rejection manual review, and key-rotation verification failures.

## Transactions-Only Financial Profile

The user confirmed a transactions-only profile on 2026-10-13 and lifecycle policy on 2026-10-15. Domain aggregation, append-only profile-fact persistence mapping, pgvector schema, semantic retrieval, a concrete embedding adapter, an explicit persistent runtime, retention/deletion operations, remote revocation retries, and versioned key rotation are implemented. Live provider/database verification and deployment scheduling/route mounting remain follow-up work.

Status: Deterministic context-source selection and an optional transaction-history provider seam exist for avoided-spend estimates. The Plaid adapter now uses the user's standing bank-link authorization, enforces user scoping and consent, and returns no profile facts after revoked consent. Victoria does not ask for per-lookup approval. Live route configuration remains outstanding.

Goal:

Build a user-scoped profile from Plaid Transactions history only. Keep profile facts compact, evidence-backed, and available to semantic retrieval; do not add balances or other Plaid products.

Required boundaries:

- Request Transactions only for the profile; transfer and payment capabilities stay unavailable.
- Define consent, disconnect, refresh, retention, deletion, and profile correction behavior.
- Preserve profile provenance, observed time, freshness, and uncertainty.
- Keep provider data and specialist context user-scoped and minimize injected data.
- Keep specialist outputs advisory; deterministic policy retains action and approval authority.
- Do not retain raw transaction payloads in conversational memory.
- No transfer/payment capabilities and no real money movement.
- Implement and verify headlessly before beginning UI work.

Done when:

- Tests cover authorization, user isolation, stale/missing/conflicting data, specialist failure, bounded inference injection, and disconnect/deletion semantics.
- Profile-derived estimates remain estimates and savings ledger writes still require exact approval.
- Plaid transfer/payment behavior is unavailable in all MVP environments.
- `npm run check` passes.

Current status: domain aggregation, `rememberFinancialProfile` persistence mapping, source provenance, HNSW embeddings, Supabase RLS, per-turn semantic retrieval, conversational correction of a clear recent financial fact, encrypted Item-token storage, cursor-based Plaid transaction persistence, consent-checked profile refresh, optional metadata coverage/enrichment, explicit runtime composition, `MemoryOrchestrator` lifecycle, 90-day cleanup, authenticated disconnect/delete-all, queued remote revocation retries, and versioned token-key rotation are implemented. Next: connect the profile provider to estimate decisions, mount authenticated routes and scheduled maintenance, configure secrets and the target Supabase project, verify migrations/RLS, and perform a controlled key-rotation rehearsal before enabling live reads. Broader natural-memory extraction remains later personalization work; users do not review or edit memory through a separate interface. No live calls or credentials were used here.

## Slice 13: Correct A Recorded Savings Amount

Source story: `docs/user-stories.md` Story 11

Goal:

Let the user correct a just-recorded mocked savings amount without changing the original ledger entry.

Expected behavior:

- Resolve the target only from a completed entry in the same conversation and owned by the user.
- Ask for a valid corrected USD amount and exact approval.
- Append an immutable, linked signed adjustment record; keep the original entry intact.
- Apply adjustments to the original entry's effective amount in weekly totals.
- Make retries idempotent by user and approved action ID.

Done when:

- Agent tests cover proposal, exact approval, decline/ambiguity, unchanged original history, and no-context clarification.
- Tool tests cover invalid amounts, wrong users, non-mocked targets, idempotent retries, and effective weekly totals.
- `npm run check` passes.

## Slice 14: Runtime Intent And Monetary Boundaries

Source rules: `docs/specification/mvp-safety-contract.md` rules ARC-001, ARC-002, and FIN-004

Goal:

Keep malformed classifier output, unsupported estimate values, and unsafe monetary calculations from entering a proposal or reported total.

Expected behavior:

- Validate classifier values at runtime, even when an adapter satisfies the TypeScript interface.
- Discard unknown classifier fields, including any model-supplied approval claim.
- Route invalid classifications or estimated suggestions to clarification without proposing a ledger action.
- Require money conversion, formatting, sums, and projections to stay in safe integer cents.

Done when:

- Agent tests prove malformed outputs cannot produce a proposal or mutation and an `approved` field is ignored.
- Domain tests cover invalid cents and arithmetic overflow.
- `npm run check` passes.

## Slice 15: Explicit Proposal State Transitions

Source rules: `docs/specification/mvp-safety-contract.md` rules STA-001 and STA-003

Goal:

Represent approval, decline, and replacement as deterministic, action-bound transitions while preserving proposal snapshots.

Expected behavior:

- Every pending proposal is bound to its exact action ID.
- Approval, decline, and supersession use one transition function that checks proposal, user, and action identity.
- Replaced proposals become terminal `superseded` records linked to their replacement.
- A transition from any terminal state is rejected; a stale action cannot create a ledger entry.

Done when:

- Domain tests cover every allowed transition, invalid identity, and terminal-state rejection.
- Agent tests cover transition records for confirmation, decline, and proposal replacement.
- `npm run check` passes.

## Slice 10: Honest Recovery From Ledger Write Failure

Source rules: `docs/specification/mvp-safety-contract.md` rules IDM-001, IDM-003, ERR-003, and ERR-004

Goal:

Victoria should keep a confirmed mocked-ledger action safe and retryable when writing fails or the outcome is uncertain.

Expected behavior:

- Never say an entry was recorded when the tool reports an error.
- Tell the user the result could not be confirmed and offer one safe retry step.
- Keep the same approved action pending for retry.
- Reuse the exact same approval record when retrying after an uncertain result, so the saved record and the confirmed response have consistent links.
- Make retrying the same user/action identifier idempotent in the mock ledger.
- Apply the same retry behavior to linked corrections and goal allocations.

Done when:

- Tests cover failure before persistence and an uncertain outcome after persistence.
- Retrying after either outcome produces at most one mocked record and preserves the same approval for entries, corrections, and goal allocations.
- The saved entry's user, proposal, action, approval, and ledger links agree with the confirmed proposal transition.
- `npm run check` passes.

## Slice 16: Close Remaining In-Memory Safety Gaps

Status: Complete for the current mock, in-memory MVP. Durable storage uniqueness remains future work.

Source rules: `docs/specification/mvp-safety-contract.md` rules ARC-002, INT-001, INT-002, INT-004, COR-001, COR-002, and MEM-001

Goal:

Keep model suggestions advisory, give every turn one supported action, and make financial history safe to inspect without accidentally rewriting it.

Expected behavior:

- The model cannot supply approval or tool instructions that Victoria executes.
- Every agent result has one recognized intent and action; MVP real-transfer requests stop at a refusal.
- Proposals carry their event, user, suggestion, mock-only mode, creation time, and state.
- Callers receive detached, frozen snapshots of agent results and mock-ledger records.
- Updated spending evidence is used for later suggestions and does not change an existing proposal or entry.
- Habits, goals, and remembered decisions are isolated by user.
- Goal allocations use the corrected effective entry amount, not the original amount before adjustments.

Done when:

- Contract tests cover the supported action outcomes and real-transfer refusal boundary.
- Agent tests cover immutable snapshots and future-only evidence updates.
- The only remaining safety contract item requires durable storage that is outside the in-memory MVP.
- `npm run check` passes.

These are useful later, but should wait until the core loop works:

- OpenAI-backed classification adapter.
- Prisma/Postgres persistence.
- Plaid sandbox transaction reads.
- Notification reminders.
- Production deployment.

## Multi-Agent Prototype Status

The non-UI, in-memory behavior queue is implemented; durable-adapter uniqueness (`IDM-004`) remains deferred until persistence exists. The mock composition injects specialists into the live headless `VictoriaAgent`; an opt-in OpenAI specialist team now supports Financial Moment, Savings Reasoning, and Companion Voice behind `OPENAI_AGENT_TEAM_ENABLED`. The full provider team is disabled by default. Deterministic core checks retain proposal, approval, ledger, progress, goal, correction, and transfer authority. Provider-team behavior is covered with mocked HTTP responses; live model quality and cost remain unevaluated. Production server/durable-state work remains separate.

The server/durable-state track has a pure turn lifecycle, a user-scoped repository contract with an in-memory adapter under `src/app/turns/`, and a headless submission handler in `src/app/http/submit-turn-handler.ts`. The user confirmed that product behavior and mock multi-agent integration should continue before production authentication or server rollout. Keep these server foundations isolated while that work proceeds; the current in-memory adapter does not survive restarts or coordinate across processes.

The first durable slice adds `PostgresTurnRepository`, a shared `pg` pool factory, `npm run db:migrate`, and `db/migrations/0001_victoria_turns.sql`. It uses database uniqueness for `(user_id, idempotency_key)` and row locks for revision transitions. The adapter is not wired into the default app composition. A database instance and production route are not configured. Pending proposal/ledger state and cross-process conversation leases are still outstanding.

See [`multi-agent-readiness.md`](architecture/multi-agent-readiness.md) for staged prerequisites and acceptance evidence. The deterministic cases under `tests/evaluation/` are scripted smoke checks, not a benchmark of real specialist models.

Use [`multi-agent-evaluation-protocol.md`](architecture/multi-agent-evaluation-protocol.md) to plan provider-backed comparison; its proposed thresholds have not been accepted.

## Final Phase: Victoria UI

Do not begin this phase until every non-UI MVP slice above is complete and `npm run check` passes.

This phase may include:

- The browser-based Victoria conversation experience.
- Mocked savings ledger and progress views.
- Shared UI components and the Victoria design system.
- Responsive and accessible interaction states.
- End-to-end browser journeys.

Do not create a temporary testing UI before this phase. Exercise unfinished behavior through headless tests instead.
