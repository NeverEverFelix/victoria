# Conversation Architecture Spec Follow-up

Date: 2026-10-29

This record tracks each finding in the attached `VICTORIA_CONVERSATION_ARCHITECTURE_CODEX_SPEC.md`. The attachment is an engineering review, not a replacement for `docs/mvp.md`, `docs/user-stories.md`, or the MVP safety contract. Proposed schemas and examples remain recommendations unless recorded as decisions below.

## Confirmed Architecture Direction

The user confirmed the following responsibility split, recorded in [decisions.md](../decisions.md):

- A conversational model handles interpretation, explanation, continuity, and phrasing.
- Typed services handle factual retrieval, calculations, permissions, and financial state changes.
- Deterministic policy validates every requested monetary operation.

The conversational model remains advisory. It cannot authorize, construct, or execute a monetary operation. The MVP continues to use a mocked savings ledger and has no real-money movement.

## Finding Status

| ID | Status | Evidence and remaining work |
| --- | --- | --- |
| C01 Memory learning interrupts the reply | Fixed and regression-tested | Successful memory extraction no longer returns a canned acknowledgment. A validated memory may be persisted while the ordinary response path answers the user's question. Regression coverage verifies both the answer and exactly one memory write, with no ledger action. |
| C02 General conversational responder / C05 voice lacks context | Implemented; quality review remains | The read-only `ConversationResponder` receives curated recent turns, relevant memories, workflow context, and typed factual context. It cannot mutate financial state. Assessment and policy paths remain deterministic for monetary clarification and approval. Provider quality still needs blinded human review. |
| C03 Pending financial state is instance-local | Durable state, expiry, restart, local concurrency, and fail-closed outage behavior verified | Persistent stores scope savings proposals, goal allocations, corrections, clarifications, and savings-event history to user/conversation. Pending workflows survive agent reconstruction; completed-entry targeting is recovered from scoped event history. A 24-hour expiry now appends immutable terminal transitions. The local PostgreSQL integration suite passed its 18 cases, including restart and concurrent approval coverage. A new regression verifies unavailable durable proposal state cannot authorize a write. Stores remain specialized rather than one universal versioned repository; deployed multi-worker stress testing remains open. |
| C04 Financial event classification is not full dialogue interpretation | Addressed with typed contextual planning; model output remains advisory | `ConversationIntentPlan` describes dialogue act, multiple intents, workflow relation, action request, referents, uncertainty, and ambiguity. These fields do not grant approval. Deterministic policy resolves the actual operation. |
| C06 Local route can silently use a mock conversational stack | Addressed for configured local provider mode | Named runtime profiles now map to explicit provider/mock wiring. Local provider conversation can use provider-backed interpretation and response while all financial tools stay mock-ledger-only. Runtime-factory tests cover the selected profile; a deployed route has not been verified. |
| C07 Rolling strings and cache are inadequate authoritative history | Typed durable history and summary coverage checkpoints implemented; prompt/retention policies remain separate | Turns use typed roles with durable adapters, and episodic summaries track covered turns and bounded source messages so already-summarized messages are not repeatedly fed as new evidence. PostgreSQL restart coverage passed. Prompt context remains bounded; this limit does not define retention. History outage/recovery behavior remains unverified. |
| C08 Hardcoded ordinary-reply personalization | Partially addressed; guarded recovery remains | General conversation routes through the responder when configured. Topic-specific deterministic fallbacks remain for provider failure and bounded recovery. They should only be reduced after equivalent provider behavior passes held-out and human review. |
| C09 Retrieved memory is not translated into a natural answer | Implemented; relevance quality still needs review | Context building ranks and filters scoped memories, applies freshness/supersession and category limits, and supplies selected provenance to the responder. Content-free selection diagnostics are emitted. Held-out relevance and contradiction review remains outstanding. |
| C10 Conversational evaluation is incomplete | Evaluation harness and initial live comparison complete; post-fix provider and human quality gates remain open | The initial 50-turn provider comparison is saved at `tests/evaluation/reports/provider-comparison-2026-10-29.json`. Both arms had zero money-safety failures. Baseline completed 47/50 (3 malformed/timeout failures), intent 45/50, action 39/50, amount 43/50; p50/p95 latency 2.235/3.874 s; estimated total cost $0.07455. Specialist team completed 50/50, with the same intent/action/amount counts; p50/p95 latency 5.441/10.002 s; estimated total cost $0.13573. This is a single local run before the latest parser, remembered-habit, and provider-fallback fixes, so it is diagnostic, not release evidence. The corrected mock-contract comparison now passes all 50 cases in both arms with zero safety failures, but only 21/50 intent, 27/50 action, and 36/50 amount matches; identical arms and low match rates confirm it is plumbing evidence, not model-quality evidence. A 47-case randomized blind packet and rubric are ready at `tests/evaluation/reports/blinded-review-2026-10-29.csv` and `.md`. A post-fix provider rerun is still blocked because no usable provider key is available in the local environment; the human review packet has not been scored. |
| C11 Specialist stages may add latency and cost | Simple-turn routing optimized; multi-stage financial workflow still requires a provider measurement and product budget | Plain read-only non-financial questions now bypass Financial Moment and route directly to the context-aware responder. Guards reject financial terms, amounts, and pending workflows; action and financial requests retain typed specialist and deterministic policy paths. Regression tests prove specialist calls are skipped. The initial specialist path for the broader corpus was about 2.4x baseline p50 latency and 2.6x p95 latency, with 1.82x total cost. A post-fix live latency comparison remains blocked by the missing provider key. The existing 2.5 s p50, 5 s p95, 8 s deadline, and 2x cost values remain proposals, not confirmed product targets. |
| C12 Per-turn diagnostics are incomplete | Content-free v2 context and decision traces implemented; durable storage intentionally excluded | Agent traces now include duration, classification/action outcome, ledger-write flag, proposal transition count, source-reference count, recent message count, typed-versus-legacy history representation, and a hashed turn reference. Provider usage logs collect role, timing, token usage, estimated cost, and request IDs. Raw prompts, conversation text, and memory values remain excluded. Durable trace storage remains out of scope without a retention/access policy. |

## Additional Reliability Fixes From Evaluation

- Financial Moment provider errors and malformed structured output now degrade to a typed, neutral clarification with zero state change. The provider comparison runner records safe failure labels and continues instead of aborting the whole corpus.
- Explicit user-stated dollar amounts are separated from provider-inferred or remembered amounts. Habit names may be supplied to the classifier as entity references, but the associated historical amount is withheld; typed savings reasoning retrieves the factual estimate.
- Explicit amount parsing handles a trailing comma before conjunctions such as “and” without losing the amount.
- “I saved money today” is not routed as a progress question, and provider classification fallback has regression coverage.
- A topic switch during a pending approval is answered as a topic switch; it does not approve the pending action. Vague approval remains a no-write clarification.
- Completed mock-ledger responses explicitly say that the ledger record is mocked and no real money moved.

## Verification And Evidence Limits

- The initial 50-turn live comparison was run with mock financial tools and no bank access. Its raw report includes request IDs and aggregate usage; it does not contain conversation text.
- A live multi-turn provider challenge covered unrelated-topic switching, vague approval, history recall, and one exact confirmed mocked entry. It passed without real-money movement.
- The final `npm run check` passed with 935 tests, 25 skipped, and 9 todo; the local PostgreSQL persistence suite passed 18 cases. The mock-contract comparison passed both 50-turn arms with zero safety failures. Exact commands and quality limits are recorded in the current session-history entry.
- No hosted migration, deployment, PostgreSQL outage test, or real-money operation was performed.

## Remaining Work

1. Re-run focused provider cases affected by amount parsing, remembered-habit grounding, and provider-output failure handling; then repeat the frozen comparison after the fixes.
2. Complete blinded human review of baseline and specialist conversation quality and define release thresholds.
3. Measure and reduce specialist latency/cost without weakening typed service and deterministic policy boundaries.
4. Extend local PostgreSQL reliability coverage for outage/recovery and deployed multi-worker behavior; restart and concurrent approval are already covered by the passing loopback suite. Keep remote migration/deployment work separately reviewed.
5. Keep traces content-free; decide retention/access controls before adding durable per-stage trace storage.

## Crosswalk To The 2026-10-29 Conversation Architecture Review

The attached review groups overlapping concerns into findings F01–F08. This crosswalk records the current implementation status against those findings; passing deterministic tests is not provider-quality evidence.

| Finding | Status | Current evidence and remaining gap |
| --- | --- | --- |
| F01 Rule-heavy intent and route recognition | Partially addressed | `ConversationIntentPlan` remains the deterministic safety-oriented baseline. For turns that can bypass financial classification, `interpretConversationTurn` asks the model to interpret the full bounded context snapshot into a validated advisory plan; `shouldDispatchConversationIntent` permits only safe read-only routing from it. Strict amount/workflow parsing stays deterministic. Held-out provider-backed paraphrase evaluation is open. |
| F02 Fragmented overlapping interpretations | Partially addressed | The model-assisted `AdvisoryTurnPlan` is passed to the read-only responder and can inform its single dispatch guard. Turns handled by Financial Moment do not incur a second interpretation call; its contextual classification and deterministic pending-workflow policy remain authoritative. A unified plan for every workflow, shadow disagreement telemetry, and provider-quality evidence remain open. |
| F03 Conversation as the default interaction | Implemented in current local behavior; quality review open | Context-aware read-only responses and no-action reflection cases are covered, including topic switches while an approval is pending. The responder has no mutation tools. Naturalness and multi-intent quality still need blinded review. |
| F04 `VictoriaAgent` coordinator complexity | Partially addressed | Context building, workflow state, reply composition, routing hints, and persistence already live in focused modules. Provider memory extraction, validation, supersession, and turn provenance now share `memory-learning-service.ts`; `VictoriaAgent` remains a large coordinator and needs further seam-by-seam parity work. |
| F05 Safe but conversation-poor fallback | Improved; residual coverage open | On provider failure during clear promotion or debt topic switches with a pending savings proposal, fallback now addresses the topic and states the proposal remains unchanged. Regression coverage verifies read-only behavior; the promotion scenario also verifies a later explicit yes records exactly once. Other unrecognized topics may still use a bounded baseline. |
| F06 Memory relevance and learning latency | Partially addressed | Scoped, provenance-aware retrieval, same-fact supersession, relevance reasons, and bounded memory context are implemented and tested. Provider extraction still runs synchronously in some response paths; a durable idempotent learning queue and blinded relevance scoring remain open. |
| F07 Context and continuity parity | Mostly implemented; external runtime coverage open | A typed context snapshot carries scoped dialogue, facts, memory, episodes, references, workflows, and verified calculations. Regression coverage includes monthly/annual resolution, proposal revision, ambiguity, topic switch, and restart. Hosted multi-worker/outage parity remains open. |
| F08 Model/specialist overhead | Open for post-fix provider evidence | The recorded pre-fix provider comparison showed higher latency/cost for specialists without matching gains in intent/action/amount scores. A corrected mock comparison is plumbing evidence only. A fresh live rerun, blinded review, and approved budgets require provider credentials, a rate card, and human reviewers. |

### Ten Review Scenarios And Their Expected Outcomes

These are acceptance scenarios, not claimed live-provider transcripts. The cited unit/integration suite exercises the deterministic safety and routing behavior; provider-quality wording remains unverified without the external evaluation gate.

| Scenario | Expected behavior | Evidence |
| --- | --- | --- |
| Promotion and unease about saving | Acknowledge the personal change; do not create a proposal or ledger entry. | `tests/test-plan.md`, reflection and fallback cases |
| “Yes, but what about the debt?” during pending approval | Treat the message as ambiguous/read-only; no approval or write. | Pending-workflow and mixed-intent tests |
| Counterfactual use of a freed gym amount | Resolve only a validated reference; keep it planning context, not realized savings. | Planning-reference and conditional-projection tests |
| Historical “I moved money last week” question | Answer as a read-only historical question; do not initiate a transfer. | Intent-plan and money-movement boundary tests |
| “I don’t want to transfer money” | Honor negation and keep the turn read-only. | Intent-plan regression table and movement-intent tests |
| Topic switch during pending approval with provider outage | Answer the topic-specific promotion question, state the proposal is unchanged, and make no write. | New fallback and agent regressions |
| Irrelevant remembered interest | Do not introduce it into a response unless current context makes it useful. | Memory retrieval/context selection tests; human relevance scoring open |
| Monthly vs annual follow-up | Attach the answer to the current covered expense; retain annual amount as conditional projection. | Planning-choice and restart tests |
| Revised pending amount | Supersede/version the proposal and require fresh exact approval. | Proposal-revision and persistence tests |
| Provider cost/quality tradeoff | Compare frozen post-fix provider runs and blinded scores; do not infer quality from mock tests. | Open: provider key/rate card and human scoring required |

### Current Change From This Crosswalk

- Consolidated the read-only dialogue dispatch condition in `src/agent/conversation-intent-plan.ts`; `VictoriaAgent` now calls that single handoff after the plan is built. This does not promote the advisory plan into approval authority.
- Improved the pending-proposal provider-outage fallback for an explicit promotion discussion and added a regression proving the pending proposal remains unchanged until a later explicit confirmation.
- Added a strict model-assisted advisory turn plan for the read-only conversation path. It receives the canonical scoped context snapshot, rejects unknown fields (including amounts, IDs, permissions, and tool calls), and cannot authorize a financial action. Financial Moment turns reuse their existing model interpretation rather than paying for a duplicate call.
- Extracted the shared optional memory-learning persistence path into `memory-learning-service.ts`, preserving current validation, append-only supersession, retry deduplication, source-turn provenance, and content-free failure reporting.
- Added the fallback expectation to `tests/test-plan.md`.
