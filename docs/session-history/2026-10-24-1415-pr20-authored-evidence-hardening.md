# Session: Ground review fixes in user-authored evidence

- Date: 2026-10-24
- Time: 14:15 EDT
- Status: Completed
- Scope: Address reproducible evidence and restoration issues in the latest PR 20 review.

## Outcome

Planning choices and confirmed behavior derive from the scoped user message rather than a classifier summary. Later-sentence preferences can be remembered without swallowing adjacent financial context or interrupting the financial reply. Restored planning choices reject unsafe annual arithmetic.

## Work Completed

- Updated [victoria-agent.ts](../../src/agent/victoria-agent.ts) to parse the current user message when constructing covered-expense planning state, retrieve matching user-authored conversation evidence when recording confirmed behavior, and require a unique nonempty source message when recovering a horizon.
- Added safe-integer multiplication validation for restored planning choices in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Scanned sentence-scoped direct statements in [extract-preference.ts](../../src/agent/memory/extract-preference.ts), while preserving the financial response for mixed turns and leaving provider extraction to own a mixed fact when configured.
- Added later-sentence memory coverage in [preference-memory.test.ts](../../tests/unit/agent/preference-memory.test.ts) and updated the [test plan](../../tests/test-plan.md).

## Decisions

- User-authored, conversation-scoped evidence is required for the observed covered-expense behavior; an unmatched model summary is not sufficient evidence.
- The documented provider defaults and eight-fact ceiling remain confirmed in [decisions.md](../decisions.md).

## Verification

- `npm run check` passed: 67 test files and 617 tests passed, 15 skipped, 9 todo.
- The existing unused-variable lint warning and SQLite experimental warnings remained.

## Unresolved

- Hosted staging was not replayed for this local repair.
- The AI reviewer continues to restate superseded default-setting and three-fact assumptions. First-turn voice quality remains a separate evaluation target.

## Recommended Next Step

Push the fix, verify CI, then evaluate first-turn conversational quality across varied covered expenses and interests.
