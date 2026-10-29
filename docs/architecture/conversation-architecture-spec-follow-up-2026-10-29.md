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
