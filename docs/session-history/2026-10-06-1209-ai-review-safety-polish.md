# Session: Polish provider response safety after AI review

- Date: 2026-10-06
- Time: 12:09 America/New_York
- Status: Completed locally; hosted re-review pending
- Scope: Address provider prompt, safe-disclosure, and live-test-loading findings from PR 12.

## Outcome

Aligned Companion Voice instructions with the validated-amount contract, expanded safe movement-disclosure handling, and moved local env loading into the explicitly confirmed smoke path.

## Work Completed

- Updated [openai-specialists.ts](../../src/agent/team/openai-specialists.ts) so Companion Voice may use validated assessment amounts and the response/schema limit is 1,000 characters.
- Updated [team-response-policy.ts](../../src/agent/team-response-policy.ts) to accept standard no-movement disclosures while continuing to reject affirmative movement claims.
- Moved the `@next/env` import into the opt-in smoke test body in [provider-agent-team-live.test.ts](../../tests/evaluation/provider-agent-team-live.test.ts).
- Added request-contract assertions in [create-victoria-agent.test.ts](../../tests/unit/app/create-victoria-agent.test.ts) and normalized disclosure assertions in [team-prototype.test.ts](../../tests/unit/agent/team-prototype.test.ts).

## Decisions

- The live smoke requires both local invocation and `CONFIRM_LIVE_SMOKE=1`; it throws if CI is detected.

## Verification

- `npm run check` — passed: 259 tests passed, three files skipped, two tests skipped, one todo.
- `git diff --check` — passed.
- No live provider request was run because no local key is configured.

## Unresolved

- Hosted AI re-review is pending.

## Recommended Next Step

Commit and push the verified changes, then inspect the refreshed PR checks and AI review.
