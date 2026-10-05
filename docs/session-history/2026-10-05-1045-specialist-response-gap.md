# Session: Specialist clarification response gap

- Date: 2026-10-05
- Time: 10:45 EDT
- Status: Completed
- Scope: Review the mock specialist integration for product behavior gaps and preserve clear clarification behavior.

## Outcome

Specialist assessment and Companion Voice output can no longer replace an expected clarification with a non-question statement. Invalid asks degrade to Victoria's fixed clarification prompt.

## Work Completed

- Added validation requiring an ask assessment to contain a question mark in [team-assessment-policy.ts](../../src/agent/team-assessment-policy.ts).
- Rejected non-question Companion Voice drafts for ask outcomes in [team-response-policy.ts](../../src/agent/team-response-policy.ts).
- Added behavior coverage for both invalid paths in [team-prototype.test.ts](../../tests/unit/agent/team-prototype.test.ts).
- Recorded the expected behavior in [test-plan.md](../../tests/test-plan.md).
- Reviewed the core specialist handoff: proposals still require agreement with deterministic estimate and explicit approval; specialists do not create ledger entries.

## Decisions

- Confirmed product boundary: specialist advice stays advisory; clarification, estimates, approval, and ledger actions remain guarded by Victoria's deterministic core.
- No new production authentication or server work was added in this session.

## Verification

- `npm run check` passed: agent setup validation, lint, both type checks, and 222 tests; one test skipped and one remains todo.
- `git diff --check` passed.
- The worktree already contained broader uncommitted changes from preceding sessions; this session preserved them.

## Unresolved

- Ask validation checks for question punctuation, not semantic usefulness; model output still relies on deterministic fallback checks for known safety constraints.
- Specialist provider quality and latency remain unevaluated; the wired specialists are mocks.

## Recommended Next Step

Continue headless product development by reviewing mismatches between specialist classifications and the core agent's decision on representative multi-turn scenarios. Keep production provider, auth, and persistence rollout separate until the product behavior is ready.
