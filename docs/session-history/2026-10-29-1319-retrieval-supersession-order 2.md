# Session: Retrieval supersession ordering

- Date: 2026-10-29
- Time: 13:19 EDT
- Status: Completed
- Scope: Make explicit same-fact correction links authoritative during memory retrieval version resolution.

## Outcome

The retrieval planner now excludes a superseded version before timestamp and relevance ranking when both records share the same `(category, key)` identity.

## Work Completed

- Added same-fact `supersedesId` precedence to [retrieval-planner.ts](../../src/agent/memory/retrieval-planner.ts).
- Added a regression where timestamps tie and the stale memory has a stronger semantic match in [retrieval-planner.test.ts](../../tests/unit/agent/memory/retrieval-planner.test.ts).
- Updated retrieval expectations in [test-plan.md](../../tests/test-plan.md) and the F8 review notes in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- An explicit supersession link between the same fact identity outranks timestamp and relevance; timestamp and relevance continue to rank among remaining current candidates.
- Semantic conflict detection across different keys, query rewriting, and episodic retrieval remain outside this narrow change.

## Verification

- `npx vitest run tests/unit/agent/memory/retrieval-planner.test.ts` — passed, 7 tests.
- `npm run check` — passed; 89 test files passed, 9 skipped; 852 tests passed, 25 skipped, 9 todo.
- Existing lint warning: unused `_observedThrough` in `tests/unit/agent/memory-orchestrator.test.ts`. SQLite experimental warnings remain.

## Unresolved

- F8 remains partial; broad conflict handling and query rewriting are not implemented.
- The worktree contains unrelated untracked conflict-copy files suffixed ` 2`; they were not changed or staged.

## Recommended Next Step

- Evaluate retrieval conflict cases involving distinct keys without weakening the shared evidence and provenance gates.
