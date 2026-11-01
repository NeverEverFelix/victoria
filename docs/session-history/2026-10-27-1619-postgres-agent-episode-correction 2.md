# Session: PostgreSQL agent episode correction lifecycle

- Date: 2026-10-27
- Time: 16:19 America/New_York
- Status: Partial
- Scope: Extend durable-turn episode correction coverage through the persistent PostgreSQL integration path.

## Outcome

Added a guarded PostgreSQL integration case that creates an episode through explicit agent conversation finish, corrects its linked fact, and verifies a fresh repository and agent do not recall the retired episode.

## Work Completed

- Added the end-to-end case to [postgres-persistent-chat.integration.test.ts](../../tests/integration/memory/postgres-persistent-chat.integration.test.ts).
- Updated the lifecycle expectation in [test-plan.md](../../tests/test-plan.md) and recorded the persistent-path coverage in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- The persistent lifecycle case stays behind `RUN_POSTGRES_MEMORY_CHAT_INTEGRATION=true` and the existing safe-local-database guard.
- Reconstructing the repository, orchestrator, and agent is the integration test's process-restart boundary.

## Verification

- Focused Vitest invocation selected the integration file, but the suite was skipped because the opt-in PostgreSQL integration guard was not enabled in this environment.
- `npm run check` passed: agent setup validation, lint, application and test typechecks, 84 test files passed, 9 skipped; 760 tests passed, 25 skipped, 9 todo.
- Existing lint warning remains for `_observedThrough` in `tests/unit/agent/memory-orchestrator.test.ts`. Node emitted experimental SQLite warnings.
- `git diff --check` passed.

## Unresolved

- The new PostgreSQL assertions still need execution in an environment with the safe local database integration enabled.
- The worktree contains other in-progress changes from earlier sessions; this entry describes only this integration increment.

## Recommended Next Step

- Run the guarded PostgreSQL memory integration suite against the approved local test database, then continue with the next open conversational deep-dive finding.
