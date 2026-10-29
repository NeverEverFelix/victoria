# Session: Interest And Hobby Spend Personalization

- Date: 2026-10-22
- Time: 15:08 America/New_York
- Status: Complete for the bounded headless slice
- Scope: Learn directly stated ordinary interests and recurring activity spend, then use matching context with clear source attribution and correction.

## Outcome

Victoria now stores ordinary hobbies/interests from direct first-person statements, stores recurring activity spend only when a USD amount and cadence are explicit, and uses matching memories in ordinary replies. Stale interest corrections append linked inactive facts. Exact matching transaction-profile categories can inform an activity-spend response with their source window and count disclosed.

## Work Completed

- Added deterministic extraction for direct interest statements and recurring hobby-spend statements in [extract-preference.ts](../../src/agent/memory/extract-preference.ts).
- Interest facts use the existing `other` memory category; recurring user-reported activity spend uses `financial_pattern`. No migration was needed.
- Updated the mock ordinary-turn classifier to support direct interest/spend statements and “how much do I spend on…” questions.
- Added relevant topic matching, source attribution, stale-fact invitations, exact-category profile spend responses, and inactive-interest suppression in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Expanded the optional provider extractor instructions and rejected provider-generated amount-bearing spend facts; the explicit-cadence deterministic path owns those facts.
- Documented Story 21, memory schema behavior, product decision, work queue, and test-plan coverage.

## Decisions

- Confirmed: Victoria may remember direct ordinary interests and explicit recurring spend amounts tied to an activity.
- Confirmed: no recurring spend is inferred from liking an activity, a one-time purchase, an amount without a time period, or a loosely related transaction category.
- Confirmed: user-reported and transaction-derived amounts are source-labeled and invite correction; an explicit “no longer enjoy” statement suppresses that activity and its spend from current hobby personalization.
- Confirmed: memory is context only and does not create or approve a savings action.

## Verification

- New targeted tests passed for interest capture, topic relevance, spend attribution, exact profile category matching, ambiguous/tentative/sensitive rejection, and stale-interest correction.
- `npm run check` passed: 506 tests passed, 15 skipped, and 9 todo; 7 test files skipped.
- `git diff --check` passed.
- Existing ESLint warning for `_observedThrough` and Node SQLite experimental warnings remain.

## Unresolved

- There is no user-facing memory-management or chat UI; the repository's headless-first sequence remains in effect.
- Hobby spend can only use directly stated recurring periods or an exact normalized transaction category match. Real-world transaction category names may not align with user activity names, so Victoria will ask rather than infer in those cases.
- The direct statement parser handles one activity per message; broad natural-language extraction remains opt-in and cannot create amount-bearing spend facts.

## Recommended Next Step

Exercise the new conversation cases against the deployed hosted staging runtime after the authorization smoke check and add further activity phrasing only when user-tested examples justify it.
