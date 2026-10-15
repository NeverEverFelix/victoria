# Session: Use remembered routines in ordinary reflections

- Date: 2026-10-15
- Time: 10:18 America/New_York
- Status: Completed
- Scope: Let relevant remembered recurring habits inform ordinary reflective replies.

## Outcome

When a user discusses a topic that matches a remembered coffee, takeout, or named-merchant routine, Victoria may refer to that routine in a supportive ordinary reply across conversations. Routine frequency is never converted into an amount.

## Work Completed

- Added relevance checks and restrained routine descriptions to ordinary reflective replies in [`victoria-agent.ts`](../../src/agent/victoria-agent.ts).
- Added tests in [`preference-memory.test.ts`](../../tests/unit/agent/preference-memory.test.ts) for a Friday DoorDash routine learned in one conversation and used in a later one, no spend estimate or ledger entry, and no context leakage to another user.
- Updated [`user-stories.md`](../user-stories.md), [`test-plan.md`](../../tests/test-plan.md), and [`mvp.md`](../mvp.md).

## Decisions

- Confirmed: a matching routine can shape ordinary financial reflections; it does not supply an amount, create an action, or count as approval.
- Confirmed: only retrieved and topic-relevant supported routine types are used by this response path.

## Verification

- Targeted memory test passed (33 tests).
- `npm run check` passed: agent validation, lint, both TypeScript checks, and tests (404 passed, 4 skipped, 9 todo; 6 test files skipped).
- No live provider, Plaid, or database calls were made.

## Unresolved

- The local runtime uses process-local mock memory, so remembered routines do not survive process restarts or span server instances.
- Episodic summaries still do not shape ordinary replies, and the default chat route is not connected to durable storage or a trusted login/session issuer.

## Recommended Next Step

Add relevance-gated episodic context to ordinary replies, with tests that stale or unrelated episodes are not surfaced. Keep persistence and production runtime work separate from this mock-backed behavior slice.
