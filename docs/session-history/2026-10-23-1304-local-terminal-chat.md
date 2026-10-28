# Session: Local Terminal Chat

- Date: 2026-10-23
- Time: 13:04 America/New_York
- Status: Completed
- Scope: Add an interactive terminal workflow for talking to and testing Victoria locally.

## Outcome

`npm run chat` now starts the app on loopback and provides an interactive CLI using a short-lived local signed session. It uses mock AI and ledger behavior to avoid provider cost and real money movement.

## Work Completed

- Added [the local chat CLI](../../scripts/chat-local.mjs), which loads ignored `.env.local`, requires the local development environment and a strong local `AUTH_SECRET`, starts Next on `127.0.0.1:3210`, and shuts it down when the CLI exits.
- The CLI uses a stable local identity for memory continuity, keeps turns in one conversation, supports `/new`, `/help`, `/quit`, and `/exit`, and does not print the signing secret or bearer token.
- Added the `npm run chat` command and setup instructions in [README.md](../../README.md).
- Added the CLI boundary to [the chat test plan](../../tests/test-plan.md).

## Decisions

- Confirmed: terminal chat is an acceptable headless testing path; a Victoria web chat interface remains deferred.
- The CLI forces mock model behavior and disables provider-backed extraction, personalization, summaries, and specialist calls. Persistent storage follows `VICTORIA_MEMORY_MODE` from `.env.local`; the CLI does not run migrations.

## Verification

- `npm run chat` with a piped avoided-spend message — started the loopback server, received HTTP 200, returned a savings confirmation question, and stated that no real money moved; `/quit` stopped the server.
- `npm run check` — passed: 65 test files passed, 7 skipped; 556 tests passed, 15 skipped, 9 todo.
- Existing ESLint warning at `tests/unit/agent/memory-orchestrator.test.ts:112` and Node SQLite experimental warnings remain.

## Unresolved

- This CLI uses the deterministic mock language adapter, not ChatGPT/OpenAI. It is for local behavior testing and does not provide an interactive sign-in flow.
- Persistent memory requires a running, migrated local database and `VICTORIA_MEMORY_MODE=persistent` in `.env.local`.

## Recommended Next Step

- Run `npm run chat` and test the savings flows interactively. Use `/new` to check cross-conversation memory within the local CLI identity.
