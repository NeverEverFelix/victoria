# Session: Local Mock Chat Route

- Date: 2026-10-14
- Time: 11:31 EDT
- Status: Completed
- Scope: Mount a locally gated authenticated chat route for Victoria and verify conversational correction without live integrations.

## Outcome

The Next app now mounts `/api/victoria/[conversationId]` for local development only. It requires a signed short-lived bearer session and runs the mock agent, memory, and ledger adapters. No login/session issuing flow or persistent runtime is mounted, so this is a local integration boundary rather than a ready-to-use authenticated product session.

## Work Completed

- Added HMAC-signed session helpers in [`signed-session-auth.ts`](../../src/app/http/signed-session-auth.ts).
- Added request validation and authenticated chat dispatch in [`victoria-chat-handler.ts`](../../src/app/http/victoria-chat-handler.ts).
- Added a fail-closed local-only mock runtime in [`create-local-mock-victoria-runtime.ts`](../../src/app/http/create-local-mock-victoria-runtime.ts) and mounted it at [`route.ts`](../../app/api/victoria/%5BconversationId%5D/route.ts).
- Added focused correction and HTTP boundary coverage in [`conversational-correction.test.ts`](../../tests/unit/agent/conversational-correction.test.ts) and [`victoria-chat-handler.test.ts`](../../tests/unit/app/victoria-chat-handler.test.ts).
- Updated the environment guide, learning schema, agent work queue, and [`test-plan.md`](../../tests/test-plan.md) to record route behavior and remaining boundaries.
- Updated two semantic-memory assertions to reflect the repository's current query sequence; they previously depended on outdated query indexes/counts.

## Decisions

- The route is enabled only with `APP_ENV=local`, `NODE_ENV=development`, and a non-placeholder `AUTH_SECRET` of at least 32 bytes.
- Identity comes only from the signed bearer claim. The request body cannot supply `userId`.
- The route uses only mock model, memory, and ledger adapters; it returns 503 outside local development.
- No login/session issuer, Supabase connection, live Plaid, OpenAI runtime, or real money movement was enabled.
- Users correct or clarify memory in conversation; there is no separate memory review/edit interface.

## Verification

- `npm run check` passed: agent validation, lint, application and test typechecks, and 44 passing test files (389 passed, 4 skipped, 9 todo; 6 files skipped).
- `git diff --check` passed.
- No live provider or database calls were made.

## Unresolved

- A trusted login/session boundary must issue the signed session before a client can call the route. Do not expose the signer through an unauthenticated token-minting endpoint.
- The local mock runtime is process-local and loses chat memory/ledger state on restart; durable PostgreSQL/Supabase runtime wiring remains unconfigured.
- Supabase migrations and RLS have not been verified against a live project; no Plaid or OpenAI credentials were used.
- The worktree contains many other uncommitted financial-profile and memory changes from prior work. Preserve them; this session did not attempt to isolate or discard them.

## Recommended Next Step

Add or identify a trusted local login/session issuer and connect it to the route without weakening the local-only gate. Then decide whether the next integration slice is durable storage or a testable local sign-in flow; keep live credentials and provider calls out until separately requested.
