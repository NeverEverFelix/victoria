# Session: Preserve mixed topics in conversational fallback

- Date: 2026-10-28
- Time: 14:10 EDT
- Status: Completed
- Scope: Keep both a read-only money-stress reflection and an independent low-cost meal request when conversational generation is unavailable.

## Outcome

The deterministic read-only fallback recognizes a narrow mixed case containing budget or money stress and a low-cost meal request. It answers with a concise prioritization prompt and a concrete inexpensive meal idea without introducing a specific financial amount or ledger action.

## Work Completed

- Added a reusable low-cost meal answer matcher and mixed-topic composition in [conversation-fallback.ts](../../src/agent/conversation-fallback.ts).
- Preserved the early fallback guard: pending workflows, validated financial facts, or historical savings context still use the supplied baseline.
- Added a regression in [conversation-fallback.test.ts](../../tests/unit/agent/conversation-fallback.test.ts).
- Updated [test-plan.md](../test-plan.md) and finding F5 in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- Deterministic fallback may compose two safe read-only replies for this narrow mixed intent.
- Workflow context retains precedence and prevents an unrelated fallback from obscuring a pending financial action.

## Verification

- Focused fallback tests passed: 10 tests.
- `npm run check` passed: 89 test files passed, 9 skipped; 834 tests passed, 25 skipped, 9 todo.
- `git diff --check` passed.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts`; Node emits experimental SQLite warnings.

## Unresolved

- Fallback quality remains evaluated only for a limited set of deterministic intents; broader recovery evaluation remains open.
- The checkout already contained many unrelated uncommitted changes and session entries; preserve them.

## Recommended Next Step

- Continue with the next partial conversational-review behavior, and add a forced-provider-failure regression for any mixed-intent fallback that is newly covered.
