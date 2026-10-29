# Session: Route unpunctuated read-only topic statements

- Date: 2026-10-27
- Time: 18:23 America/New_York
- Status: Partial
- Scope: Close one bounded F1 gap by allowing explicit read-only topic statements to reach the conversational responder without question punctuation.

## Outcome

The ordinary conversation route now accepts explicit read-only topic switches such as “I want to talk about changing jobs” without requiring `?`. Finance-heavy statements and action language remain on their existing paths unless the user clearly frames a read-only topic switch.

## Work Completed

- Added `shouldRouteToConversationResponder` and applied it to the no-pending conversational route.
- Added helper and agent regressions for unpunctuated topics, budget topic switches, direct record requests, finance-heavy statements, and avoided-spend statements.
- Updated the [MVP contract](../mvp.md), [user stories](../user-stories.md), [test plan](../test-plan.md), and [deep-dive review](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).
- The first focused test run exposed two unintended routing changes. The predicate was narrowed to explicit read-only topic switches plus ordinary non-financial questions; pending-allocation memory refresh and avoided-spend amount clarification now retain their prior handling.

## Decisions

- Unpunctuated statements are not automatically conversational. Only clear read-only topic framing bypasses the question-mark check; generic statements still go through existing financial classification.
- This is a conservative routing slice, not a first-class multi-intent router. F1 remains partial.

## Verification

- Focused routing and agent tests passed (151 tests before the final guard regression; the full suite below includes it).
- `npm run check` passed: 84 test files passed, 9 skipped; 787 tests passed, 25 skipped, 9 todo.
- `git diff --check` passed.
- Existing lint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:146` for unused `_observedThrough`.

## Unresolved

- Existing dirty-worktree changes remain intact.
- The broad intent-router and mixed-intent requirements in F1 remain open, alongside the other partial/open findings in the review matrix.

## Recommended Next Step

- Continue F1 with mixed-intent cases only after defining conservative behavior for simultaneous conversational and financial requests; otherwise take the next bounded F5 recovery case.
