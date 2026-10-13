# Session: Add a local provider-team smoke command

- Date: 2026-10-06
- Time: 11:49 America/New_York
- Status: Completed locally; live request not run because local credentials are absent
- Scope: Add an opt-in headless command for one real provider-team turn with mock memory and ledger tools.

## Outcome

Added `npm run agent:smoke:provider-team`. It loads ignored local environment files, requires a local environment with the provider team enabled and mock ledger mode, sends one synthetic avoided-spend turn, and verifies that no ledger entry was created without approval.

## Work Completed

- Extended [create-victoria-agent.ts](../../src/app/create-victoria-agent.ts) to accept injected memory and tools while retaining its mock defaults.
- Added the opt-in live smoke test at [provider-agent-team-live.test.ts](../../tests/evaluation/provider-agent-team-live.test.ts) and the package command.
- Documented local setup and the potential provider-call cost in [environments.md](../environments.md) and [evaluation README](../../tests/evaluation/README.md).
- Added `@next/env` as a direct development dependency to load `.env.local` using Next's supported environment loader.

## Decisions

- The smoke run uses a synthetic avoided-spend message, mock memory and ledger tools, and sends no approval.
- It is skipped during normal test/check runs. It makes up to three provider requests when manually invoked.
- No local `.env.local` or API key was available, so no provider request was sent.

## Verification

- `npm run check` — passed: agentic setup validation, lint, TypeScript checks, and 257 tests passed; three test files skipped, two tests skipped, and one todo.
- The smoke test remained skipped in the normal check; it was not run live.
- `git diff --check` — passed.

## Unresolved

- Live provider connectivity and actual model output remain unverified until a real key and local provider model are configured.
- Production routes, authentication, durable conversation state, and cross-process coordination remain separate work.

## Recommended Next Step

Set a real key and model in ignored `.env.local`, enable `OPENAI_AGENT_TEAM_ENABLED`, and run `npm run agent:smoke:provider-team`. Review the reported role calls and final response; the command must leave the mock ledger empty.
