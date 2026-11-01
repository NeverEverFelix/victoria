# Session: Answering a separate question in a mixed financial turn

- Date: 2026-10-28
- Time: 12:11 America/New_York
- Status: Completed
- Scope: Close one F1 mixed-turn gap while preserving the mocked-ledger approval boundary.

## Outcome

An avoided-spend statement followed by a clearly separated everyday question now gets a conversational answer and the existing pending savings confirmation in the same turn. The proposal remains pending until the user explicitly approves it.

## Work Completed

- Added `independentOrdinaryQuestion` in [conversation-routing.ts](../../src/agent/conversation-routing.ts) for sentence-separated and comma-plus-question clauses. Questions that include financial action language are rejected.
- Composed the responder's answer with the existing savings confirmation after the proposal is created in [victoria-agent.ts](../../src/agent/victoria-agent.ts). The financial decision and exact approval tool call remain intact.
- Added route and agent regressions in [conversation-routing.test.ts](../../tests/unit/agent/conversation-routing.test.ts) and [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts). They verify the everyday answer, pending proposal, no ledger entry before approval, and successful exact approval afterward.
- Updated [test-plan.md](../../tests/test-plan.md) and the F1 review notes in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- Confirmed behavior: only a clearly separated non-financial ordinary question is answered independently alongside a new avoided-spend suggestion. The separate question cannot approve or change a financial action.
- The punctuation-bound rule is an incremental F1 improvement; the planned first-class multi-intent router remains open.

## Verification

- Focused: `npm test -- --run tests/unit/agent/conversation-routing.test.ts tests/unit/agent/victoria-agent.test.ts` — 163 tests passed.
- Full: `npm run check` — agent validation, lint, application and test typechecks passed; 89 test files passed, 9 skipped; 818 tests passed, 25 skipped, 9 todo.
- `git diff --check` passed.
- Existing warnings: unused `_observedThrough` in `tests/unit/agent/memory-orchestrator.test.ts:146`; Node experimental SQLite warnings.

## Unresolved

- F1 remains partial. Clause extraction is intentionally conservative and does not replace a semantic multi-intent router; broader mixed-intent cases still need coverage.
- The worktree already contained many unrelated modified and untracked files before this session. They were preserved and not audited as part of this slice.

## Recommended Next Step

Continue F1 with a compact set of mixed-turn evaluations covering finance plus advice, ordinary questions, and follow-up requests; then decide whether the current deterministic separators can be retired in favor of a first-class intent result.
