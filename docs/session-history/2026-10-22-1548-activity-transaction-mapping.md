# Session: Activity To Transaction Mapping

- Date: 2026-10-22
- Time: 15:48 America/New_York
- Status: Complete
- Scope: Let users explicitly map an activity to a linked transaction category or merchant and keep transaction aggregates separate from their own recurring-spend estimate.

## Outcome

Victoria now accepts a narrow set of direct user statements that link an activity to a transaction category or merchant. For a later spend question, it retrieves the linked profile fact through that mapping, identifies the mapping and profile observation window/count, and asks whether the mapping remains correct. When the user has also stated a recurring amount, Victoria labels that estimate separately from the transaction total.

## Work Completed

- Added deterministic mapping extraction, uncertainty rejection, and sensitive-topic rejection in [extract-preference.ts](../../src/agent/memory/extract-preference.ts).
- Added a second user-scoped profile retrieval using the explicitly mapped category/merchant and mapping-aware spend wording in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added tests for category mapping, merchant mapping, source separation, and rejection of tentative, question-form, or sensitive mappings in [preference-memory.test.ts](../../tests/unit/agent/preference-memory.test.ts).
- Updated [Story 21](../user-stories.md), [MVP memory boundary](../mvp.md), [learning schema](../specification/user-learning-schema.md), [decisions](../decisions.md), [test plan](../../tests/test-plan.md), and [agent work queue](../agent-work-queue.md).
- No schema migration was needed; mappings are user-scoped append-only `financial_pattern` facts.

## Decisions

- Confirmed: only a direct user-stated activity-to-category/merchant link can bridge an activity and a transaction profile label; no similarity-based category inference is added.
- Confirmed: user-reported recurring amounts and linked transaction totals remain separately attributed. A user statement does not become an observed transaction total.
- Confirmed: remembered mappings do not estimate savings or authorize financial actions.

## Verification

- `npx vitest run tests/unit/agent/preference-memory.test.ts` passed: 51 tests.
- `npm run check` passed: 514 tests passed, 15 skipped, and 9 todo; 7 test files skipped.
- `git diff --check` passed.
- Existing ESLint warning for `_observedThrough` and Node SQLite experimental warnings remain.

## Unresolved

- The deterministic mapper recognizes a bounded set of direct sentences; natural-language variants may still ask rather than save.
- A user-confirmed mapping can outlive their intent until corrected or forgotten. Each mapped response asks whether the mapping remains right; user-facing controls still depend on the headless-first UI sequence.
- The workspace contained substantial pre-existing uncommitted changes before this slice; they were preserved and are not attributed to this session.

## Recommended Next Step

Run the hosted staging authorization and memory verification before relying on these mappings in a deployed chat runtime; then gather real phrasing examples before broadening the parser.
