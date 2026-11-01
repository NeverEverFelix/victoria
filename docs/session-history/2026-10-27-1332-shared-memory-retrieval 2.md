# Session: Shared Memory Retrieval Ranking

- Date: 2026-10-27
- Time: 13:32 EDT
- Status: Partial
- Scope: Continue addressing the conversational-core deep-dive findings, focusing on consistent durable-memory retrieval.

## Outcome

Added one deterministic ranking implementation for typed conversation context and personalized reply memory selection. Eligibility remains enforced by each consumer, and the planner itself excludes non-user provenance, inactive interests, and low-confidence memories.

## Work Completed

- Added [retrieval-planner.ts](../../src/agent/memory/retrieval-planner.ts) to rank current fact versions using query overlap, semantic similarity, recency, and correction provenance, then apply a bounded result cap.
- Routed typed context selection and personalized reply selection through the shared planner while retaining their separate category and evidence rules.
- Added planner regression tests for newest-version deduplication, ranking, caps, provenance, confidence, and inactive interests.
- Updated [mvp.md](../mvp.md) and [test-plan.md](../test-plan.md) to document shared ranking and event-reference expectations.

## Decisions

- Confirmed implementation choice: retrieval ranking is shared, while prompt-context and personalization eligibility contracts remain separate.
- No new product behavior or memory categories were approved.

## Verification

- Focused tests: `npm test -- --run tests/unit/agent/memory/retrieval-planner.test.ts tests/unit/agent/conversation-context-builder.test.ts tests/unit/agent/preference-memory.test.ts` — 91 tests passed.
- Full check: `npm run check` — agent setup validation, lint, type checks, and tests passed; 80 test files passed, 9 skipped; 727 tests passed, 23 skipped, 9 todo.
- `git diff --check` passed.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node also emits experimental SQLite warnings.

## Unresolved

- Stable-memory extraction still does not run on every eligible conversational intent. Broader intent-independent extraction needs a carefully defined exclusion gate for sensitive facts, corrections, forget requests, and financial actions.
- Episodic evidence and workflow-result grounding, reviewable memory controls/telemetry, the larger agent refactor, and provider-backed multi-turn quality evaluation remain open findings.
- The worktree contains pre-existing user changes and untracked files; none were reset or overwritten.

## Recommended Next Step

Define and test the explicit extraction eligibility gate before broadening provider-backed learning beyond existing deterministic extraction and read-only topic-shift handling.
