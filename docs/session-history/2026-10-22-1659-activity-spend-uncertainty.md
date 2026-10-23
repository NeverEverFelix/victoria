# Session: Activity Spend Uncertainty

- Date: 2026-10-22
- Time: 16:59 America/New_York
- Status: Complete for the headless reply behavior
- Scope: Ask a focused follow-up when an activity-spend amount is unavailable and make the freshness of recalled amounts and transaction summaries clear.

## Outcome

Spend questions with no relevant memory now ask for a typical amount and period, or for the user to identify a linked transaction category/merchant. Recalled user-reported periodic amounts include their last-noted date and invite confirmation. Linked transaction replies continue to show the profile window, warn that the history may not reflect current spending, and invite correction. Stale profile summaries remain unavailable and are not repeated as current amounts.

## Work Completed

- Added a focused missing-amount/activity follow-up and topical extraction for ordinary activity spend questions in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added last-noted dates to user-reported recurring spend replies and explicit freshness language to transaction-profile replies.
- Added tests for unknown activity spend, stale transaction totals, source freshness, and correction invitations in [preference-memory.test.ts](../../tests/unit/agent/preference-memory.test.ts).
- Updated [Story 21](../user-stories.md), [MVP memory boundary](../mvp.md), and [test plan](../../tests/test-plan.md).

## Decisions

- Confirmed: no reliable amount means ask; Victoria does not estimate or invent a dollar value from interest alone.
- Confirmed: only current transaction-profile facts may be surfaced; replies include the observation range and invite correction of category/mapping fit.
- Confirmed: user-reported recurring amounts are attributed to the user and include when they were last noted.

## Verification

- `npx vitest run tests/unit/agent/preference-memory.test.ts` passed: 53 tests.
- `npm run check` passed: 520 tests passed, 15 skipped, and 9 todo; 7 test files skipped.
- `git diff --check` passed.
- Existing ESLint warning for `_observedThrough` and Node SQLite experimental warnings remain.

## Unresolved

- The deterministic spend-topic parser supports a bounded set of question forms; unusual phrasing may still ask which activity the user means.
- Hosted staging verification remains outstanding.
- The workspace contains substantial pre-existing uncommitted changes; they were preserved and are not attributed to this session.

## Recommended Next Step

Exercise the activity-spend prompts and freshness wording against authenticated staging after completing the hosted authorization smoke check, then add only user-tested phrasing variants.
