# Session: Semicolon mixed-question routing

- Date: 2026-10-29
- Time: 13:13 EDT
- Status: Completed
- Scope: Extend mixed avoided-spend and ordinary-question routing to semicolon-separated clauses.

## Outcome

Victoria now extracts a clearly separate non-financial question after a semicolon and presents it as a clean standalone question to the read-only responder.

## Work Completed

- Extended clause splitting and normalized extracted question openings in [conversation-routing.ts](../../src/agent/conversation-routing.ts).
- Added routing-helper and end-to-end mixed-turn regressions in [conversation-routing.test.ts](../../tests/unit/agent/conversation-routing.test.ts) and [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts). The integration case checks one pending confirmation and no ledger entry before approval.
- Updated coverage notes in [test-plan.md](../../tests/test-plan.md) and the F1 progress in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- Semicolon is treated as a clear clause boundary for ordinary question extraction. Extracted financial action questions remain excluded.
- This is another bounded routing heuristic, not first-class intent decomposition; F1 remains partial.

## Verification

- `npx vitest run tests/unit/agent/conversation-routing.test.ts tests/unit/agent/victoria-agent.test.ts` — passed, 173 tests.
- `npm run check` — passed; 89 test files passed, 9 skipped; 849 tests passed, 25 skipped, 9 todo.
- Existing lint warning: unused `_observedThrough` in `tests/unit/agent/memory-orchestrator.test.ts`. SQLite experimental warnings remain.

## Unresolved

- F1 still needs first-class intent decomposition and broader mixed-intent evaluation.
- The worktree contains unrelated untracked conflict-copy files suffixed ` 2`; they were not changed or staged.

## Recommended Next Step

- Continue with one specific remaining review finding, keeping financial side effects on the deterministic approval path.
