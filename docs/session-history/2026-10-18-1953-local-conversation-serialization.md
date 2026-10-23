# Session: Serialize local persistent chat turns

- Date: 2026-10-18
- Time: 19:53 America/New_York
- Status: Partial
- Scope: Prevent overlapping persistent local chat requests for the same user and conversation from interleaving state changes across runtime instances.

## Outcome

Added a PostgreSQL advisory-lock coordinator at the local chat handler boundary. It uses nonblocking lock attempts and releases the waiting connection between attempts, so the small local pool retains capacity for the active turn's own database operations.

## Work Completed

- Added the [conversation coordinator contract](../../src/app/turns/conversation-coordinator.ts) and [PostgreSQL coordinator](../../src/app/turns/postgres-conversation-coordinator.ts).
- Wired coordination into [the chat handler](../../src/app/http/victoria-chat-handler.ts) and the persistent local runtime in [runtime composition](../../src/app/http/create-local-mock-victoria-runtime.ts). Mock mode remains unchanged.
- Documented required same-conversation and cross-action concurrency coverage in the [test plan](../../tests/test-plan.md) and [agent work queue](../../docs/agent-work-queue.md).

## Decisions

- Scope locks by authenticated user ID and route conversation ID; the client cannot supply a different user identity.
- Use PostgreSQL session advisory locks, which release when the database connection closes. This requires no schema migration.
- Keep persistent chat local-only. The existing $27 demo proposal remains pending and was not approved.

## Verification

- `npm run typecheck` passed.
- `npm run typecheck:test` passed.
- `npm run lint` passed with one existing warning for `_observedThrough` in `tests/unit/agent/memory-orchestrator.test.ts`.
- No runtime concurrency tests were run; cross-process serialization remains unverified under simultaneous requests.

## Unresolved

- Add and run PostgreSQL concurrency coverage for same-conversation turns, independent conversations, simultaneous approval/decline, and duplicate approval.
- Review the Next webpack resolver change from the preceding live smoke test for the deployed build path.
- Trusted local sign-in/session issuance and a chat UI remain absent; the user has not requested UI work.

## Recommended Next Step

Add PostgreSQL integration coverage for the local conversation coordinator and terminal-action locking, then decide whether to proceed toward a trusted staging identity boundary or finish the remaining non-UI MVP behavior.
