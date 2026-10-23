# Session: Broaden Natural Activity Memory Phrasing

- Date: 2026-10-22
- Time: 20:00 America/New_York
- Status: Partial
- Scope: Capture multiple explicit recurring activity-spend amounts in one turn and accept additional direct activity-to-transaction mapping phrasing.

## Outcome

Deterministic learning now extracts separate activity-spend facts from a message containing multiple explicit amount/activity/cadence clauses. Each fact retains the full original user message as evidence, and the acknowledgement names every captured activity. Activity mappings now recognize direct first-person categorization and mapping phrases such as “I categorize my climbing expenses as outdoor recreation.” Uncertain and sensitive mapping checks remain in place.

## Work Completed

- Added multi-clause spend extraction and broader explicit mapping forms in [extract-preference.ts](../../src/agent/memory/extract-preference.ts).
- Updated [VictoriaAgent](../../src/agent/victoria-agent.ts) to persist additional activity-spend and mapping candidates from the same turn and acknowledge multiple saved recurring amounts.
- Added behavior tests for two recurring amounts in one message and a natural categorization statement in [preference-memory.test.ts](../../tests/unit/agent/preference-memory.test.ts).
- Updated [Story 21](../user-stories.md), [test plan](../../tests/test-plan.md), [MVP memory policy](../mvp.md), and [learning schema](../specification/user-learning-schema.md).

## Decisions

- Confirmed by existing policy: a recurring activity amount needs its own explicit amount and cadence; a mapping must be a direct user statement and is context only.
- If a clause lacks a clear cadence, it does not become a recurring amount. Activity and category/merchant links are never inferred from a question or a loose semantic association.

## Verification

- `npx vitest run tests/unit/agent/preference-memory.test.ts` passed: 65 tests.
- `npm run typecheck:test` passed.
- `npm test` passed: 537 tests passed, 15 skipped, and 9 todo; 7 test files skipped.
- `npm run check` passed agent validation and lint, then failed source typecheck because generated `.next/types/cache-life.d 2.ts` and `.next/types/routes.d 2.ts` contain duplicate definitions. Those generated workspace files were left untouched.
- `git diff --check` passed.

## Unresolved

- Parser coverage is intentionally bounded; add phrases from actual user examples and retain negative tests for ambiguity.
- The workspace contains substantial pre-existing uncommitted changes; they were preserved.

## Recommended Next Step

After the generated `.next/types` duplicate files are resolved, rerun `npm run check`. Then try the new phrasing through authenticated staging chat before expanding the deterministic patterns further.
