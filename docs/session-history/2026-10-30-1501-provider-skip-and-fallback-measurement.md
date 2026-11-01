# Session: Provider Skip and Fallback Measurement

- Date: 2026-10-30
- Time: 15:01 America/New_York
- Status: Partial
- Scope: Improve F08 measurement coverage for the model-approved plain-dialogue classifier skip and conversational fallback outcomes.

## Outcome

The opt-in live conversation challenge now includes a no-pending, unpunctuated plain-dialogue turn that exercises the model-approved financial-assessment skip. It records the assessment route, provider roles and timing, and content-free conversation-reply fallback counts/rate. Normal repository checks do not invoke this live provider test.

## Work Completed

- Passed `onFinancialAssessmentRoute` through [`create-victoria-agent.ts`](../../src/app/create-victoria-agent.ts) so opt-in evaluation can observe the fixed content-free route categories.
- Extended [`provider-conversation-challenge-live.test.ts`](../../tests/evaluation/provider-conversation-challenge-live.test.ts) to assert the no-pending plain dialogue is routed as `skipped_model_dialogue`, uses turn understanding and companion voice, and is answered without deterministic fallback. It emits per-turn role/timing plus aggregate fallback rate for the challenge's read-only replies.
- Updated the evaluation README and F08 crosswalk. This test has not been run against a live provider in this session; it remains chargeable and opt-in.
- The repository already had broad uncommitted review-follow-up changes. No commit, deployment, hosted migration, or real-money operation was performed.

## Decisions

- Keep the full live-provider exercise explicitly opt-in and use mock ledger tools.
- Report fixed route/fallback categories and provider role timing without raw hidden reasoning or credentials.
- Do not treat harness instrumentation or mocked tests as provider-quality evidence.

## Verification

- `npx vitest run tests/evaluation/provider-comparison.test.ts tests/unit/agent/victoria-agent.test.ts tests/unit/app/victoria-chat-handler.test.ts`: 205 passed.
- `git diff --check`: passed.
- `npm run check`: passed; 108 test files passed, 9 skipped; 1,022 tests passed, 27 skipped, 9 todo.
- SQLite experimental warnings appeared during the suite.

## Unresolved

- The live challenge and the post-optimization full provider comparison remain unrun; their outputs are needed to measure route frequency, fallback rate, provider calls, latency, and cost.
- Blinded human ratings, accepted cost/latency thresholds, and hosted reliability remain open.
- F01/F02/F04 still need requirement-by-requirement review against the full implementation, including whether non-workflow fast paths defer to contextual model understanding.

## Recommended Next Step

Continue auditing early semantic fast paths against the user-approved advisory-plan design. Then, when provider access and cost are intentionally available, run the opt-in comparison/challenge and attach human scores rather than claiming the instrumentation itself closed F08.
