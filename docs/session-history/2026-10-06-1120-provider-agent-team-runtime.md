# Session: Wire the provider agent team into the live core

- Date: 2026-10-06
- Time: 11:20 America/New_York
- Status: Completed locally
- Scope: Add an opt-in provider-backed specialist team to the existing live headless Victoria agent and verify the composition with mocked HTTP responses.

## Outcome

`VictoriaAgent` can now use OpenAI Responses for Financial Moment, Savings Reasoning, and Companion Voice when `OPENAI_AGENT_TEAM_ENABLED=true`. The default remains deterministic mocks. Provider outputs stay advisory and pass the existing deterministic validation, response guard, approval, and mock-ledger boundaries.

## Work Completed

- Added provider-backed Savings Reasoning and Companion Voice specialists in [openai-specialists.ts](../../src/agent/team/openai-specialists.ts), reusing the existing Financial Moment adapter.
- Added the default-off `OPENAI_AGENT_TEAM_ENABLED` environment flag and wired provider-team selection in [create-victoria-agent.ts](../../src/app/create-victoria-agent.ts).
- Hardened Companion Voice validation against promises of real money movement, guarantees, and balance-protection claims in [team-response-policy.ts](../../src/agent/team-response-policy.ts).
- Added mocked-response composition coverage for all three roles, exact approval, unsupported assessment rejection, and the early refusal path for real transfer requests.
- Updated environment examples, product/developer docs, the test plan, and readiness notes.

## Decisions

- Confirmed by implementation: the full provider team is opt-in; `OPENAI_MODEL=mock` continues to select mocks.
- Confirmed boundary: specialists receive no tools, cannot approve or write, and cannot initiate or claim real money movement. The deterministic core still validates amounts and manages approvals and the mocked ledger.
- No model quality, cost, or latency claim is made; no live provider request was made.

## Verification

- `npm run check` — passed: agentic setup validation, lint, TypeScript checks, and 255 tests passed; two test files skipped, one test skipped, and one todo.
- `git diff --check` — passed.
- Provider requests were simulated through injected fetch mocks; no external API call was made.

## Unresolved

- Live model behavior and provider reliability have not been exercised.
- Per-role token and cost reporting is not implemented.
- Provider evaluation and production persistence/runtime readiness remain separate unfinished tracks.
- Earlier local branch-handoff and evaluation-preparation changes remain uncommitted in the workspace.

## Recommended Next Step

After the user supplies an OpenAI key in local environment configuration, run one opt-in local conversation through the provider team and inspect the actual output. Keep the default off and the mock-ledger boundary in place; do not turn on real money movement.
