# Session: Classification-independent memory eligibility

- Date: 2026-10-27
- Time: 15:51 America/New_York
- Status: Partial
- Scope: Continue the F7 memory-learning changes by removing the fixed positive classifier-intent allowlist.

## Outcome

Optional stable-fact extraction eligibility is no longer coupled to a fixed set of read-only intent names. The policy still excludes explicit action intents and uncertain-intent annotations.

## Work Completed

- Updated [memory-learning-policy.ts](../../src/agent/memory/memory-learning-policy.ts) to use a narrow action-intent deny list plus existing text privacy, lifecycle, and uncertainty checks.
- Added policy coverage for a future read-only classifier label in [memory-learning-policy.test.ts](../../tests/unit/agent/memory/memory-learning-policy.test.ts).
- Updated [test-plan.md](../../tests/test-plan.md) and the F7 implementation note in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- Keep goal allocation, proposal revision, ledger correction, and real-money movement intents ineligible for optional provider extraction.
- Keep all uncertain-intent annotations ineligible.
- Broader durable post-turn extraction remains a proposal; this change does not add a queue or background worker.

## Verification

- Focused memory-learning policy and agent tests passed.
- `npm run check` passed: 84 test files passed, 9 skipped; 754 tests passed, 24 skipped, 9 todo.
- `git diff --check` passed before the full check.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted experimental SQLite warnings.

## Unresolved

- The accepted-turn pipeline still performs optional memory extraction in-process before completing the response. Durable extraction jobs, retry semantics, and retention controls remain open design work.
- The worktree contains other in-progress changes from earlier sessions; this entry records only this F7 policy slice.

## Recommended Next Step

- Determine whether the existing durable turn lifecycle can safely persist post-response extraction intent and retry status without delaying or duplicating user-visible turn results.
