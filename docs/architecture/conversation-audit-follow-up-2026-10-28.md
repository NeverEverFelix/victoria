# Conversation Architecture Audit Follow-up

Date: 2026-10-29

This is a code-and-evidence status for the audit dated 2026-10-28. The audit distinguishes observed code from possible failure modes and labels its changelog as proposed future work. This follow-up does the same: it records implementation completed in this checkout and evidence still needed. It does not imply a production release or provider-quality result.

## Checkout Baseline

- Active checkout: `feature/victoria-agent-core` at `ea76635f32f7c7d6d3fc15d89149c45dc6c00f65`.
- This checkout is 86 commits ahead of local `main` and has no local-main-only commits. It has diverged from the audit's currently named feature branch ref (`307184e80208309d37d91a2c145afc757b6c1feb`): 21 commits exist only on that ref and 18 only on this checkout.
- The current branch tracks `origin/feature/victoria-agent-core`. No deployment SHA or production branch state is available from the repository, so a production release cannot be inferred.
- Migrations `0021`–`0026` already exist in the tracked checkout. This session added no migration and did not merge or reorder migration histories.
- The workspace contained pre-existing untracked files whose names end in ` 2`; they were left untouched.

## Findings

| Finding | Change in this checkout | Remaining evidence or limit |
| --- | --- | --- |
| F-01 Regex-led routing | Added a versioned contextual intent plan that distinguishes read-only dialogue/questions, direct proposal requests, corrections, and memory controls. It splits an independent question from an action request and never represents a question as approval. Added explicit projection arithmetic to the read-only dispatch path. | The planner is deterministic and bounded, not a general semantic parser. It must not replace the existing financial classifier or deterministic approval gates. More held-out paraphrase evaluation is needed before claiming routing quality. |
| F-02 `VictoriaAgent` responsibilities | Extracted read-only generation, validation, one retry, and deterministic recovery into `ConversationReplyService`. Context assembly, intent planning, and persistent workflow adapters remain separate seams. | Savings workflow transitions and memory-learning orchestration still live in `VictoriaAgent`. Further extraction should be incremental and keep public response contracts fixed. |
| F-03 Conversational continuity | Added versioned `DialogueState` derived from role-tagged turns, including the latest topic, explicit user goal, assistant question, user constraints/corrections, and already-resolved event/action references. It stays separate from workflow state. | State is rebuilt from the bounded rolling transcript. Expiry policy and durable working state beyond the 20-message window are not implemented. Derived fields are evidence aids, never action authority. |
| F-04 Memory selection | Added content-free retrieval reason codes (lexical overlap, semantic match, recency, correction, context match) to selected memory context. Existing source, confidence, lifecycle, supersession, recency, and category-budget checks remain active. | No held-out multi-session recall score or human relevance assessment was run. Reason codes explain selection; they do not establish that the selected fact is useful or current. |
| F-05 Numeric validation and arithmetic | Added a deterministic weekly/monthly one-year calculator using integer cents (52 weeks/12 months), with formula, inputs, and assumptions. Reply validation admits only the exact calculated amount; balance questions and action requests are excluded. | Calculator scope is deliberately narrow; percentages, date arithmetic, arbitrary expressions, and other periods remain unsupported. |
| F-06 Fallback behavior | Extracted recovery into `ConversationReplyService`, removed the pre-provider constrained-work shortcut, and categorized provider unavailability, invalid JSON/response, unsupported claims, action-boundary violations, and response-length failures. Observer callbacks receive only enumerated codes. | Several deterministic topic-specific fallbacks remain. Live fallback-rate and repeat-question metrics have not been measured. |
| F-07 Transcript role reconstruction | Added schema-versioned `ConversationMessage` records with stable IDs, conversation ID, role, content, timestamp, status, and optional tool-call identity. Mock, SQLite/outbox, PostgreSQL JSONB, and orchestrator adapters preserve the existing string API while adding typed transcript reads/writes. User text that begins with `Victoria:` is escaped before legacy conversion. | Existing legacy rows are converted conservatively because their original role metadata cannot be recovered with certainty. The rolling context cap and legacy read API remain. |
| F-08 Persistent and in-memory workflows | Existing persistent runtime already restores pending stores per turn, writes durable proposals/transitions transactionally, and serializes each user/conversation with a PostgreSQL advisory lock. This session preserved those boundaries and made transcript writes role-preserving. | Process maps still cache state in the in-memory MVP and persistent agent. Restart and per-conversation behavior are covered by existing integration tests, but this session did not run a live PostgreSQL concurrency or outage challenge. A database cannot make the whole agent-plus-transcript lifecycle one transaction. |
| F-09 Response expressiveness | Reply rejection now has distinct schema, style-length, unsupported-claim, and action-boundary reasons. User-requested brief/normal/detailed budgets remain separate from financial safety checks. | Existing bounded response lengths remain product constraints. A style retry beyond the current bounded generation retry was not added; detailed naturalness requires provider evaluation. |
| F-10 Dialogue measurement and observability | Added a safe structured turn trace for duration, coarse classification/action, ledger-write indicator, transition count, and source-reference count; fallback and retrieval reason codes contain no raw message or money values. | No 100+ held-out conversation run, blinded human rating, production latency/cost report, durable analytics store, repeat-question metric, or staged rollout comparison was performed. Those require provider access, a reviewed corpus, and release infrastructure. |

## Proposed Changelog Status

- **AUDIT-001:** Local branch and migration state were recorded above. Production/active deployment SHA and external branch reconciliation remain unverified.
- **TEST-001:** `npm run check` is the required final verification for this session; live provider evaluations are intentionally separate and were not run.
- **TEST-002 / EVAL-401 / EVAL-402:** Added 32 checked-in intent regression fixtures spanning reflections, mixed questions/proposals, corrections, memory controls, and ambiguous confirmations. Broader 30–50 multi-turn scenarios, a 100+ held-out quality corpus, blinded ratings, and user outcome metrics remain open.
- **SAFETY-001 / CONV-102 / STATE-202 / FIN-302:** Existing approval, scoped identity, idempotency, mock-only wording, and domain-event boundaries remain. New dialogue state and arithmetic context are read-only.
- **CONV-101:** Partially addressed by the typed contextual dispatch plan and regressions; general semantic routing quality is not established.
- **ARCH-101:** Partially addressed by the extracted `ConversationReplyService` and existing context/state/persistence modules. Savings workflow extraction remains.
- **ARCH-102:** Intent plan, transcript, trace, and rejection categories now carry explicit schema versions or fixed tagged unions; no public API version change was made.
- **STATE-201 / MEM-201 / MEM-202:** Recent dialogue state and retrieval diagnostics are implemented. Durable state TTL and held-out multi-session recall/forgetting evaluation remain.
- **DATA-201:** Structured role-aware transcript storage and a compatible legacy view are implemented in the existing JSON array; no SQL migration was required.
- **FIN-301:** Narrow deterministic recurring-savings calculator implemented; broader math remains deferred.
- **RESP-301 / RESP-302:** Validation categories and fallback causes separated; the reply service uses one bounded retry and context-aware deterministic recovery.
- **STATE-401:** Existing Postgres stores, per-conversation serialization, and idempotent actions provide the persistent runtime boundary. Live cross-process stress verification remains.
- **OBS-401:** Privacy-safe in-process callbacks implemented. Durable routing/provider/memory/action traces and usage/cost aggregation remain.
- **RELEASE-401:** No rollout was attempted; flags and staging checks must continue to gate provider/runtime changes.

## Decisions And Scope

- Confirmed product invariants remain unchanged: no real money movement, no approval from ambiguous language, and no ledger write from ordinary conversation or calculation.
- The deterministic calculator supports only explicit weekly/monthly USD contributions over one year. Broader arithmetic is a future product/implementation choice.
- This code session makes no claim about real-user naturalness or production reliability. Those claims require the separate evaluation protocol, provider-backed runs, and human review.
