# Session: Inspect local persistent memories

- Date: 2026-10-18
- Time: 20:00 America/New_York
- Status: Completed
- Scope: Expose a headless local-only endpoint for inspecting current persistent memories through the existing signed local chat session.

## Outcome

Local persistent mode now serves `GET /api/memories` through the same signed bearer session used by local chat. It returns only the authenticated user's current facts. Local `PATCH` and forget routes remain disabled; hosted memory management continues using its existing Supabase Auth boundary.

## Work Completed

- Composed the existing memory-management handler into [the local persistent runtime](../../src/app/http/create-local-mock-victoria-runtime.ts), backed by its PostgreSQL `MemoryOrchestrator` and local session authenticator.
- Routed [the memory collection endpoint](../../app/api/memories/route.ts) to that handler only in `APP_ENV=local`; local mutation methods return 405.
- Kept the local forget route disabled in [the forget endpoint](../../app/api/memories/%5BmemoryId%5D/forget/route.ts).
- Expanded [persistent chat integration coverage](../../tests/integration/memory/postgres-persistent-chat.integration.test.ts) for listing a learned memory, rejecting missing authentication, and isolating another user.
- Updated [environment guidance](../../docs/environments.md), [memory user story](../../docs/user-stories.md), [test plan](../../tests/test-plan.md), and [agent work queue](../../docs/agent-work-queue.md).

## Decisions

- Confirmed: local memory inspection reuses the already established signed local chat session. No login or session issuer was added.
- Confirmed: this slice enables inspection only in local mode. Correction and forgetting remain outside this slice; staging/production continue to use their existing authenticated memory-management routes.
- Confirmed: no UI was added.

## Verification

- PostgreSQL integration scenario: 5 tests passed using a disposable loopback database; the database was dropped afterward.
- Live local API smoke: a preference was learned through `POST /api/victoria/{conversationId}` and returned through `GET /api/memories` with HTTP 200.
- `npm run check` passed: agent validation, lint, type checks, and 470 tests passed; 9 skipped and 9 todo. The gated PostgreSQL tests are skipped by the default run.
- One existing lint warning remains for `_observedThrough` in `tests/unit/agent/memory-orchestrator.test.ts`.

## Unresolved

- Local correction and forget controls are not enabled yet.
- There is no user-facing UI or local sign-in/session-issuing flow.
- Hosted persistent chat is still a separate deployment task.

## Recommended Next Step

Add the local forget operation as a separate headless slice, verify that the fact disappears from both listing and future retrieval while its append-only history remains, then add local correction.
