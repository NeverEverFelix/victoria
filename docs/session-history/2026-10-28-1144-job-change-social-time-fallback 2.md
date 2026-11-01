# Session: Answer a Specific Job-Change Concern in Fallback

- Date: 2026-10-28
- Time: 11:44 America/New_York
- Status: Completed
- Scope: Improve grounded deterministic recovery for job-change questions about preserving social time.

## Outcome

When conversational generation fails on a job-change message that mentions friends, relationships, or social time, Victoria now responds to that named concern instead of using the broader career-tradeoff question.

## Work Completed

- Added a test-first regression in [conversation-fallback.test.ts](../../tests/unit/agent/conversation-fallback.test.ts); it failed against the previous broad prompt and passed after the targeted fallback was added to [conversation-fallback.ts](../../src/agent/conversation-fallback.ts).
- The fallback suggests checking expected hours and flexibility, asks what social time the user wants to protect, and makes no assumptions about their schedule or finances.
- Updated fallback expectations in [test-plan.md](../../tests/test-plan.md) and F5 in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- This deterministic recovery is limited to a job-change question with an explicit social-time concern. It does not add broad career advice or infer the user's schedule.
- F5 remains partial because grounded recovery covers only a small set of topics and has not been broadly evaluated.

## Verification

- Focused regression: 1 passed.
- `npm run check`: passed; 88 test files passed, 9 skipped; 806 tests passed, 25 skipped, 9 todo.
- `git diff --check`: passed.
- Existing lint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:146` for `_observedThrough` being unused.

## Unresolved

- Fallback responses still need wider user-intent coverage and measured recovery quality.
- The worktree contains extensive unrelated uncommitted work and was preserved.

## Recommended Next Step

Choose another concrete fallback failure example from the conversational review and add it only if the message itself provides enough grounding for a useful deterministic response.
