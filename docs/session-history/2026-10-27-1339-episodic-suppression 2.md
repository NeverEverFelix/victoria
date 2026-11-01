# Session: Episodic Correction and Forget Suppression

- Date: 2026-10-27
- Time: 13:39 EDT
- Status: Partial
- Scope: Prevent retrieved episode summaries from reintroducing user facts that have since been corrected or forgotten.

## Outcome

Episodic summaries are filtered against the current user-scoped correction, inactive-interest, and forget-marker view before personalization. Matching retired topics are suppressed; unrelated episodes remain eligible.

## Work Completed

- Added `suppressLifecycleConflictingEpisodes()` in [episodic-summary.ts](../../src/agent/memory/episodic-summary.ts), using normalized topic overlap from current lifecycle keys against episode summary and evidence.
- Added `MemoryOrchestrator.listCurrentConversationalMemories()` as an internal current-state view that can include forget markers without exposing them in ordinary memory retrieval.
- Integrated lifecycle filtering before episodic memories can reach the conversational personalization path in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added regression coverage for forgotten interests, inactive/corrected interests, and unrelated topics; updated [mvp.md](../mvp.md) and [test-plan.md](../test-plan.md).

## Decisions

- Confirmed implementation choice: suppression is conservative and topic-key based; forgotten/corrected episode prose is not rewritten in place.
- This is not durable event-level provenance and does not change memory retention storage.

## Verification

- Focused episode and memory-orchestrator tests: 15 passed; test type-check passed.
- `npm run check` passed: 81 test files passed, 9 skipped; 736 tests passed, 23 skipped, 9 todo.
- `git diff --check` passed.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted experimental SQLite warnings.

## Unresolved

- Topic overlap can miss paraphrased episode content or conservatively suppress an episode sharing a broad key term. Durable links from episode evidence to user-turn IDs and domain event IDs are still needed for exact lifecycle propagation.
- The current workflow-outcome source remains in-process and contains only the latest completed entry per conversation.
- Memory telemetry, broad orchestration refactoring, and provider-backed multi-turn evaluation remain open findings.
- The worktree contains pre-existing user changes and untracked files; none were reset or overwritten.

## Recommended Next Step

Add stable turn IDs and durable episode evidence links so correction/forget operations can suppress only episodes containing the affected evidence, including after process restarts.
