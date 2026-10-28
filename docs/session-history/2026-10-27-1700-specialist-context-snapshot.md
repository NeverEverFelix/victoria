# Session: Share the conversational snapshot with advisory specialists

- Date: 2026-10-27
- Time: 17:00 America/New_York
- Status: Partial
- Scope: Extend F2 so advisory specialist calls share the existing read-only conversational context snapshot.

## Outcome

Financial Moment, Savings Reasoning, and Companion Voice now receive the same context snapshot used by the responder. Upstream calls omit the baseline reply until it exists, rather than supplying placeholder text.

## Work Completed

- Added optional snapshot context to specialist request contracts in [`team-prototype.ts`](../../src/agent/team-prototype.ts).
- Constructed the snapshot before classification and passed it through the team calls in [`victoria-agent.ts`](../../src/agent/victoria-agent.ts).
- Forwarded the snapshot to provider requests in [`openai-specialists.ts`](../../src/agent/team/openai-specialists.ts).
- Added a specialist handoff regression and documented the expected boundary in [`test-plan.md`](../../tests/test-plan.md) and [`VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md`](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- The context snapshot is read-only and does not grant approval or tool authority.
- A not-yet-created baseline reply is omitted from upstream specialist context.

## Verification

- `npx vitest run tests/unit/agent/victoria-agent.test.ts tests/unit/agent/openai-specialists.test.ts` passed: 135 tests.
- `npm run typecheck` and `npm run typecheck:test` passed.
- `npm run check` passed: agent validation, lint, both typechecks, and 84 test files passed (9 skipped); 766 tests passed, 25 skipped, 9 todo.
- `git diff --check` passed.
- Existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` (`_observedThrough` unused).

## Unresolved

- F2 is still partial: specialist snapshot construction has not been reviewed for every conversational branch, and the broader context responsibilities remain distributed.
- The repository worktree contains extensive pre-existing uncommitted changes; preserve them.

## Recommended Next Step

- Run `npm run check`, then audit remaining F2 acceptance criteria and use the deep-dive review matrix to select the next unfinished slice.
