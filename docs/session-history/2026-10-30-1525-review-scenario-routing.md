# Session: Review Scenario Routing

- Date: 2026-10-30
- Time: 15:25 America/New_York
- Status: Partial
- Scope: Extend F01/F02/F05/F07 coverage against the review's mixed-intent examples and preserve deterministic financial command controls.

## Outcome

The review's debt topic switch, covered-expense trip counterfactual, negated transfer, and past-tense transfer examples now have behavior regressions. A read-only model plan can resolve a classifier-only transfer false positive, while uncertainty leads to clarification and deterministic positive transfer commands still take precedence.

## Work Completed

- Added a narrow leading-negation rule and classifier/turn-plan reconciliation in [money-movement-intent.ts](../../src/agent/money-movement-intent.ts) and [financial-turn-assessment-service.ts](../../src/agent/financial-turn-assessment-service.ts).
- Added responder and outage-fallback regressions for the yes-prefixed debt topic switch and trip counterfactual; added past-tense and negated transfer tests.
- Hardened [conversation-turn-reply-service.ts](../../src/agent/conversation-turn-reply-service.ts) so a supplied snapshot is canonical: it avoids another memory read and strips unrequested event lists, historical references, and derived event IDs. If that sanitization changes the snapshot, it discards the old interpretation and interprets the redacted context.
- Updated the review [crosswalk](../architecture/conversation-architecture-spec-follow-up-2026-10-29.md) and [test plan](../../tests/test-plan.md).
- No commit, deployment, provider call, hosted migration, or real-money operation was performed. The worktree already contains broad prior review changes.

## Decisions

- Deterministic evidence of a current real-money command always overrides advisory interpretation and remains refused in the MVP.
- A validated read-only plan may prevent a classifier-only transfer refusal only when deterministic current-command evidence is absent. Uncertainty triggers clarification rather than authorization.
- Supplied scoped context remains the single source for both turn interpretation and response generation.

## Verification

- Focused route, fallback, snapshot, and policy tests passed.
- `npm run check`: passed; 108 test files passed, 9 skipped; 1,035 tests passed, 27 skipped, 9 todo.
- SQLite experimental warnings appeared during the suite.
- `git diff --check` remains to run after this entry is written.

## Unresolved

- Additional F04 coordinator extraction remains code-addressable.
- Held-out provider paraphrase testing, blinded human review, post-optimization provider measurements, process-crash atomicity, and hosted outage/multi-worker parity remain open as tracked in the crosswalk.

## Recommended Next Step

Continue with the remaining local F04/F07 reliability seams and audit the outstanding review scenarios. Keep external and human validation gates open until evidence is available.
