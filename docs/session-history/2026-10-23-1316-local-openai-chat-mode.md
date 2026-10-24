# Session: Local OpenAI Chat Mode

- Date: 2026-10-23
- Time: 13:16 America/New_York
- Status: Partial
- Scope: Add an explicit paid-provider mode to the local terminal chat for response tuning.

## Outcome

`npm run chat -- --ai` now opts into the local OpenAI agent team and provider-backed memory extraction and personalized replies. The current `.env.local` has no usable API key, so a live paid provider response could not be exercised yet.

## Work Completed

- Updated [local runtime composition](../../src/app/http/create-local-mock-victoria-runtime.ts) to support the existing OpenAI financial moment, savings reasoning, and companion voice specialists when explicitly enabled.
- Extended [the terminal CLI](../../scripts/chat-local.mjs) with `--ai`; it requires a real key and non-mock model, uses configured local settings, enables provider responses and memory extraction, and leaves the mock ledger and real-money restrictions unchanged.
- Kept default `npm run chat` fully mocked and non-billable.
- Updated [README.md](../../README.md) and [the test plan](../../tests/test-plan.md) with provider-mode behavior and charge/data handling.

## Decisions

- Confirmed: local provider calls are acceptable for testing; public hosting is not needed.
- Confirmed: real money movement stays disabled. Provider-backed financial chat may use multiple API requests per turn; episodic summaries remain off in CLI provider mode.

## Verification

- `npm run chat -- --ai` — rejected before server startup because `.env.local` contains a placeholder/missing API key; no provider request was made.
- `npm run check` — passed: 65 test files passed, 7 skipped; 556 tests passed, 15 skipped, 9 todo.
- Existing ESLint warning at `tests/unit/agent/memory-orchestrator.test.ts:112` and Node SQLite experimental warnings remain.

## Unresolved

- Add a real OpenAI API key to ignored `.env.local`, then run `npm run chat -- --ai` to test live outputs and usage. Do not paste the key into chat or commit it.
- The live provider path has not been exercised in this session because no usable key is configured.

## Recommended Next Step

- Add a project-scoped API key locally and try a mix of ordinary reflections, avoided-spend messages, confirmations, and ambiguous money-movement requests. Review usage in the OpenAI API project dashboard.
