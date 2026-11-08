# Session: Conversation Architecture Review Findings

- Date: 2026-10-29
- Time: 15:36 EDT
- Status: Partial; local code and regression work completed, provider and human-quality gates remain open
- Scope: Cross-check the 2026-10-29 conversation architecture review against the repository, address the read-only dispatch and pending-topic fallback gaps, and record current finding status.

## Outcome

Consolidated the read-only conversation handoff into one policy function and fixed the identified outage case where a pending proposal could suppress a clear promotion topic switch. Recorded an F01–F08 status crosswalk and ten acceptance scenarios in the [architecture follow-up](../architecture/conversation-architecture-spec-follow-up-2026-10-29.md).

## Work Completed

- Added `shouldDispatchConversationIntent` as the single read-only dialogue dispatch gate and routed `VictoriaAgent` through it. The typed intent plan remains descriptive and cannot approve or mutate a financial workflow.
- Updated deterministic fallback for a clear promotion discussion during a pending savings proposal. It answers the current topic, says the proposal remains pending and unchanged, and does not repeat approval wording.
- Added unit and agent-level regressions proving the pending proposal creates no entry on the topic-switch turn and a later explicit confirmation records exactly one mocked entry.
- Added the fallback expectation to the [test plan](../test-plan.md).
- Preserved the existing findings ledger and added an explicit review crosswalk that marks each finding fixed, partial, or open with evidence and external dependencies.

## Decisions

- The attached architecture review is treated as engineering evidence and recommendations, not as authority to deploy or enable real-money movement.
- Advisory interpretation and read-only conversation never grant action authority; deterministic workflow policy and exact user approval remain authoritative.
- Provider-backed quality, blinded relevance review, approved latency/cost targets, hosted outage testing, and further coordinator extraction remain open where evidence is unavailable or the code is not yet changed.

## Verification

- `npx vitest run tests/unit/agent/conversation-intent-plan.test.ts tests/unit/agent/conversation-fallback.test.ts tests/unit/agent/victoria-agent.test.ts` — passed, 3 files and 233 tests.
- `npm run check` — passed: agent validation, lint, both typechecks, and full test suite; 92 files passed, 9 skipped; 938 tests passed, 25 skipped, 9 todo.
- Lint retains one pre-existing warning at `tests/unit/agent/memory-orchestrator.test.ts:146` (`_observedThrough`).
- `git diff --check` — passed.
- No live provider rerun or human scoring was performed; the local environment's provider credential and reviewer gates remain as recorded in the architecture follow-up.

## Unresolved

- F01/F02 remain partial: one model-assisted turn-understanding contract has not replaced all rule-built planning/classification paths, and shadow disagreement telemetry is not implemented.
- F04 remains partial: `VictoriaAgent` is still large; further extractions need focused parity work.
- F06 remains partial: some memory extraction is still on the response path; a durable idempotent learning queue and blinded relevance review are not implemented.
- F08 remains open pending post-fix provider metrics, a rate card, and blinded human scores.
- Hosted multi-worker and outage/recovery verification remains separate work.
- Numerous unrelated untracked files ending in ` 2` were present before this session and were left untouched.

## Recommended Next Step

After approved provider credentials, rate-card data, and human reviewers are available, run the frozen post-fix provider evaluation and blinded rubric. The next code slice is to evaluate whether the advisory plan should be unified with Financial Moment without adding a duplicate provider call or changing deterministic safety authority.

## Follow-up Work Completed Later In This Session

- Implemented the strict `AdvisoryTurnPlan` contract and added the optional structured-output call to the OpenAI adapter. The model receives the full scoped snapshot only on read-only turns that bypass Financial Moment; financial turns reuse the existing contextual Financial Moment interpretation, avoiding a second provider call.
- Passed validated advisory output to the conversation responder and permitted it to inform only the guarded read-only dispatch. Exact approval, intent-specific workflows, amount parsing, and write decisions remain deterministic.
- Added tests for schema validation, forbidden authority-bearing fields, provider fallback, usage accounting, prompt/schema version reporting, context delivery, and routing limits. Updated the review crosswalk and behavior test plan.
- Added a runtime regression confirming financial turns reuse Financial Moment rather than invoking a duplicate turn-understanding call.
- Extended provider-outage fallback coverage to a clear debt topic switch during a pending proposal; the reply addresses the debt topic and leaves the proposal unchanged.
- Extracted optional provider memory extraction, validation, deduplication, supersession, provenance, and content-free failure handling into `memory-learning-service.ts`, with focused tests. This reduces coordinator responsibilities but does not make extraction asynchronous or durable-queued.
- Updated verification: `npm run check` passed on 2026-10-29 at 15:53 EDT — 94 files passed, 9 skipped; 951 tests passed, 25 skipped, 9 todo. Lint has one existing warning at `tests/unit/agent/memory-orchestrator.test.ts:146` (`_observedThrough`).
- Focused regressions passed: fallback plus agent suites — 196 tests; memory-learning service, agent, and preference suites — 266 tests. `git diff --check` passed. No live provider run, hosted stress test, or human review was performed.

## Updated Remaining Gaps

- F01/F02 remain partial: the model plan covers read-only turns while Financial Moment continues to interpret financial turns. A unified plan across every turn, held-out provider evaluation, and shadow disagreement telemetry remain open.
- F03 still needs blinded naturalness and multi-intent review. F04 coordinator extraction remains partial. F06 synchronous memory extraction and human relevance review remain open. F07 hosted multi-worker/outage parity remains open. F08 still needs a post-fix live run, cost/latency comparison, and blinded scoring.
