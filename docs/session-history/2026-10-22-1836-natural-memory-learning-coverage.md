# Session: Broaden Natural Memory Learning Coverage

- Date: 2026-10-22
- Time: 18:36 America/New_York
- Status: Complete
- Scope: Let model-backed memory extraction consider natural personal statements and non-financial pattern reflections that deterministic phrasing does not recognize.

## Outcome

The extractor now runs on ordinary personal statements and pattern reflections, including non-financial unclear turns with no detected uncertain money intent. Pattern replies and necessary follow-ups continue after a memory is captured. The local mock classifier recognizes a wider set of non-question first-person sentence forms while keeping questions and explicit financial language on existing paths.

## Work Completed

- Broadened ordinary personal-statement classification in [mock-llm.ts](../../src/agent/llm/mock-llm.ts), excluding interrogative and financial/action wording from the new fallback.
- Expanded extraction eligibility in [victoria-agent.ts](../../src/agent/victoria-agent.ts) to `general_finance`, `pattern_reflection`, and `unclear` without `uncertainIntent`; kept pending financial actions excluded.
- Preserved the normal reflection or clarification response when a candidate is learned, and appended a brief acknowledgement.
- Added coverage for natural phrasing, pattern-reflection preservation, and an unclear non-financial personal statement; updated [test plan](../../tests/test-plan.md), [Story 15](../user-stories.md), and the [MVP memory boundary](../mvp.md).

## Decisions

- Provider extraction may infer a structured candidate from varied phrasing, but only when it is grounded in exact user-authored evidence and passes existing confidence, stability, assertion, and sensitivity checks.
- Unclear turns with an uncertain financial intent remain ineligible; learning cannot supersede pending approval or change a financial action.

## Verification

- Focused tests passed: 139 tests across preference-memory and VictoriaAgent suites.
- `npm run check` passed: 529 tests passed, 15 skipped, 9 todo; 7 test files skipped.
- Existing unused-variable ESLint warning and Node SQLite experimental warnings remain.
- No live provider call was made; provider behavior is covered with mocked responses.

## Unresolved

- Hosted provider classification and extraction quality still need validation against a curated set of natural user phrasing in staging.
- The workspace contains substantial pre-existing uncommitted changes; this session preserved them.

## Recommended Next Step

Build a small redacted memory extraction evaluation set covering paraphrases, mixed messages, ambiguity, quotations, negation, and sensitive content; compare provider candidates with the validator's stored facts before broadening any policy rules.
