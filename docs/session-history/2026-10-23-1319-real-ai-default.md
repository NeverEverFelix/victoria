# Session: Make Real AI the Local Chat Default

- Date: 2026-10-23
- Time: 13:19 America/New_York
- Status: Partial
- Scope: Align the terminal chat default with the user's preference to tune real model responses locally.

## Outcome

`npm run chat` now selects real provider mode by default; `npm run chat -- --mock` explicitly selects the no-API mode. A real provider run is still pending because `.env.local` does not contain a usable API key.

## Work Completed

- Reversed the CLI default so API use does not require a second opt-in after the user already approved local usage charges.
- Kept explicit `--mock` behavior for offline/no-cost checks.
- Fixed server lifecycle by spawning Next directly, checking that the loopback port is available before startup, and iterating terminal input so EOF closes cleanly.
- Updated README and test-plan instructions.

## Decisions

- Confirmed: use live model responses by default for local CLI tuning; there is no public hosting requirement.
- Confirmed: the no-API path remains available with `--mock`; the mocked ledger and no-real-transfers boundary remain in both modes.

## Verification

- `npm run chat` — stopped before server startup because the local API key is a placeholder; no API request was made.
- `printf 'I almost bought a $12 coffee but skipped it.\n/quit\n' | npm run chat -- --mock` — passed; received the expected approval-gated response and the CLI shut its server down. Confirmed port 3210 was no longer listening afterward.
- `npm run check` — passed: 65 test files passed, 7 skipped; 556 tests passed, 15 skipped, 9 todo.
- `git diff --check` — passed. Existing ESLint warning at `tests/unit/agent/memory-orchestrator.test.ts:112` and Node SQLite experimental warnings remain.

## Unresolved

- Add a real OpenAI key to ignored `.env.local` to exercise provider responses. Do not paste or commit it.
- The provider mode has not made a paid API request yet.

## Recommended Next Step

- Set a project-scoped API key in `.env.local`, run `npm run chat`, then tune the model responses using live local conversations.
