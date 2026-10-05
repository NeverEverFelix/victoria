# Session: Correction Target Confirmation

- Date: 2026-10-05
- Time: 12:07 EDT
- Status: Completed
- Scope: Make the correction target visible before approval and explain the mock Emergency Fund behavior.

## Outcome

Correction proposals now state that they target the most recently recorded entry in the conversation and show that entry's current effective amount before asking for approval.

## Work Completed

- Updated correction confirmation wording in [Victoria agent](../../src/agent/victoria-agent.ts).
- Added an assertion that the correction prompt identifies the current $27 entry before approval in [agent tests](../../tests/unit/agent/victoria-agent.test.ts).

## Decisions

- Current corrections target the most recently recorded entry available in that conversation. Since the tools do not provide an entry-history search or target selector, the prompt must name the target amount before asking for approval.
- “Emergency fund” is a mock classifier example, not a persisted or verified goal. Goal proposals remain mock-ledger allocations requiring explicit approval.

## Verification

- Focused correction and multi-agent conversation tests passed (73 tests).
- `npm run check` passed: 23 test files passed, 1 skipped; 233 tests passed, 1 todo.
- `git diff --check` passed.

## Unresolved

- Users cannot select arbitrary older entries through the current correction flow. A future history lookup and target-selection contract would be needed for that behavior.
- Goal names are not checked against a catalog; they are user-provided labels in the mock flow.
- Other worktree changes predate this session and are outside this slice.

## Recommended Next Step

Add a user-scoped savings-entry lookup and an explicit correction-target clarification flow before supporting corrections to older entries. Keep the latest-entry behavior explicit until that exists.
