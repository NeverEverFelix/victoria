# Session: Confirmed savings-goal integration

- Date: 2026-10-15
- Time: 21:56 EDT
- Status: Completed
- Scope: Connect explicitly stated conversational goals to structured savings goals only after user confirmation.

## Outcome

An explicit goal remains an evidence-backed conversational memory and Victoria asks before creating a structured savings goal. A clear yes creates a user-scoped goal; a no leaves the structured goal absent. Goal creation does not allocate savings or move money. A later allocation still requires its existing separate exact-action approval.

## Work Completed

- Added the confirmed product rule and acceptance criteria to [Story 13](../user-stories.md) and [the test plan](../../tests/test-plan.md).
- Added idempotent goal creation and user-scoped goal listing to mock, SQLite-backed, orchestrated, and PostgreSQL memory providers.
- Added [migration 0012](../../db/migrations/0012_savings_goals.sql) with owner RLS, USD/amount constraints, and action/name uniqueness.
- Added confirmation/decline behavior to the agent and coverage for confirmation, decline, isolation, and idempotency.
- Updated [MVP scope](../mvp.md) and [agent work queue](../agent-work-queue.md).

## Decisions

- Confirmed by the user: ask before creating a structured goal from a stated conversational goal.
- Confirmed: a yes only approves goal creation. Allocating a recorded entry to a goal remains a separate approval.

## Verification

- `npm run check` passed: 56 test files passed, 6 skipped; 469 tests passed, 4 skipped, 9 todo.
- After a small PostgreSQL bigint comparison fix, `npm run typecheck` and `npx vitest run tests/unit/agent/preference-memory.test.ts` passed (37 tests).
- `git diff --check` passed.
- Existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts:95`; Node reports its experimental SQLite warning.
- Migration 0012 was not applied to a database in this session; its RLS and SQL still need isolated PostgreSQL verification.

## Unresolved

- Goal creation is persisted by the explicit persistent runtime through the new repository method, but the new migration has not been applied or verified in a PostgreSQL environment.
- Allocation records still use the existing goal-name representation; they retain their current approval and immutable-history behavior.
- The worktree contains unrelated memory-controls and privacy-boundary changes from earlier sessions; preserve those changes.

## Recommended Next Step

- Apply migration 0012 in an isolated PostgreSQL database and verify authenticated user isolation, confirmed creation, and action idempotency before enabling a live runtime.
