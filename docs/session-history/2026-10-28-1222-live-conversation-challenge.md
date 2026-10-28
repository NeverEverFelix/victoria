# Session: Live conversation challenge and response cleanup

- Date: 2026-10-28
- Time: 12:22 America/New_York
- Status: Completed
- Scope: Challenge the local provider-backed conversational route and fix response duplication, approval wording, and one observed fallback gap.

## Outcome

Provider-backed local conversations confirmed that an ambiguous response leaves a mocked savings proposal pending and a separate explicit approval records only its exact amount. The live challenge also found repeated mixed-turn answers, duplicated confirmation offers, and a generic fallback after pushback on a rigid work boundary; targeted fixes and regressions now cover these cases.

## Work Completed

- Ran `npm run chat` with `DATABASE_URL=''` so the local route used in-process mock memory and ledger tools instead of writing to the configured local database. The chat used the configured provider model; eligible turns were sent to the provider.
- In the first challenge, shared promotion, Sunday cooking, and social-time context; pushed back on an absolute “non-negotiable” work boundary; then reported avoiding a $24 takeout order while asking a separate cooking question. The first mixed answer covered the cooking question twice. “That sounds good, I guess” left the proposal pending, while a later exact “Yes, record the $24…” created one mocked entry and reported a $24 weekly total. No real money moved.
- Changed [victoria-agent.ts](../../src/agent/victoria-agent.ts) to use the validated companion specialist response for a mixed financial turn when available, and call the general responder only when specialist advice is absent. Added a regression to prevent double answers while preserving the pending exact action.
- The live answer also had an incomplete offer followed by a second confirmation question. Updated [team-response-policy.ts](../../src/agent/team-response-policy.ts) so an approval question must contain the exact amount and ledger destination in that same question; incomplete recording offers are removed before one exact confirmation is appended. Added a regression for the observed wording.
- Added a second provider-backed conversation for an $18 avoided takeout turn plus a Sunday dinner question. It produced one dinner answer and one explicit $18 ledger confirmation. “Sounds good, I suppose” left the proposal pending and unrecorded.
- Added a focused, flexible work-boundary fallback to [conversation-fallback.ts](../../src/agent/conversation-fallback.ts), with unit and agent coverage for provider failure on the exact pushback message. It acknowledges the manager constraint, suggests a smaller experiment, and creates no financial action.
- Updated the F1 mixed-turn and F5 fallback review notes in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md) and the expected coverage in [test-plan.md](../../tests/test-plan.md).

## Decisions

- Confirmed behavior: one response path should answer a mixed turn; the companion specialist's validated reply takes precedence when present, avoiding a second generated answer.
- Confirmed safety boundary: the approval question itself must identify the exact amount and Victoria ledger. Amounts elsewhere in the response do not satisfy that requirement.
- Confirmed behavior: “sounds good, I guess” is ambiguous and cannot authorize a pending entry.
- No product decision was made to require absolute work boundaries; fallback advice now offers a flexible experiment and leaves the choice to the user.

## Verification

- Focused fallback, team-response policy, routing, and agent suites: 183 tests passed.
- `npm run check` passed: agent validation, lint, and both typechecks passed; 89 test files passed, 9 skipped; 821 tests passed, 25 skipped, 9 todo.
- The first full check had a transient 5-second timeout in `tests/unit/scripts/validate-agentic-setup.test.ts`; the file passed alone, and the subsequent full check passed.
- `git diff --check` passed.
- Existing warnings: unused `_observedThrough` in `tests/unit/agent/memory-orchestrator.test.ts:146`; Node experimental SQLite warnings.

## Unresolved

- The first live answer recommended making Sunday time “non-negotiable.” The user pushback then received a generic response because the constrained provider route fell back to the baseline. A targeted fallback now handles that exact provider-failure case, but other provider replies may still overstate advice or miss a correction; broader live evaluation remains necessary.
- F1 and F5 remain partial. The live sample demonstrates improvements, not general coverage.
- This worktree contains substantial pre-existing modified and untracked work. Those unrelated files were preserved and not audited.

## Recommended Next Step

Continue the live challenge with memory correction/forgetting and a financial topic shift, then add only regressions for reproducible failures. Keep provider output review separate from deterministic approval and ledger-state checks.
