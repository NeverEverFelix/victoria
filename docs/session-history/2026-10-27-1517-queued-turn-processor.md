# Session: Queued Turn Processor

- Date: 2026-10-27
- Time: 15:17 EDT
- Status: Partial
- Scope: Add a worker-callable processor for accepted queued turns and wire it into persistent runtime composition.

## Outcome

Persistent and local PostgreSQL runtimes now expose `processQueuedTurn`. It atomically claims a queued record through the existing revision transition, supplies owner/conversation-scoped completed history and the active turn to `VictoriaAgent`, and records completion or failure. Concurrent duplicate processing cannot invoke the agent twice.

## Work Completed

- Added [queued-turn-processor.ts](../../src/app/turns/queued-turn-processor.ts).
- Exposed it from persistent and local PostgreSQL chat runtimes.
- Added unit coverage for source-turn propagation, user scoping, terminal status, provider failure, and concurrent worker claims.
- Updated the deep-dive implementation note and [test plan](../test-plan.md).

## Decisions

- Failed turns remain failed until an explicit retry transition; processing does not retry them implicitly.
- Revision conflicts mean another worker claimed the turn and return `already_claimed`.
- The runtime exposes a callable processor, but queue scheduling/consumption stays with the host application.

## Verification

- `npm run check`: passed; 82 test files passed, 9 skipped; 743 tests passed, 24 skipped, 9 todo.
- `git diff --check`: passed.
- Existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted experimental SQLite warnings.

## Unresolved

- No background queue consumer or scheduler invokes the processor automatically.
- The PostgreSQL provenance restart test remains unexecuted because `DATABASE_URL` is not configured in this environment.
- Durable response-result retrieval is not part of the existing turn schema; the processor returns the `AgentResponse` to its caller.

## Recommended Next Step

Integrate `processQueuedTurn` with the hosting queue consumer and decide how that host persists and retrieves the returned response before exposing queued turns to clients.
