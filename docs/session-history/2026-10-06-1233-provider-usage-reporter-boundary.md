# Session: Separate provider usage reporting from the agent

- Date: 2026-10-06
- Time: 12:33 America/New_York
- Status: Completed locally
- Scope: Correct the telemetry boundary so provider usage is collected by a standalone reporter rather than surfaced as agent output.

## Outcome

Replaced the callback described in the preceding session entry with a dedicated `ProviderUsageReporter`. The agent does not report usage; provider adapters forward response metadata to the injected reporter, which exposes immutable records and JSON Lines.

## Work Completed

- Added [provider-usage-reporter.ts](../../src/agent/telemetry/provider-usage-reporter.ts) with `report`, immutable `snapshot`, and JSON Lines output.
- Replaced provider usage callbacks with the separately injected reporter in [openai-financial-moment.ts](../../src/agent/llm/openai-financial-moment.ts), [openai-specialists.ts](../../src/agent/team/openai-specialists.ts), and [create-victoria-agent.ts](../../src/app/create-victoria-agent.ts).
- Added reporter and composition coverage in [provider-usage-reporter.test.ts](../../tests/unit/agent/provider-usage-reporter.test.ts) and [create-victoria-agent.test.ts](../../tests/unit/app/create-victoria-agent.test.ts).
- Updated [evaluation README](../../tests/evaluation/README.md) and [multi-agent readiness](../architecture/multi-agent-readiness.md) to describe the reporter boundary.

## Decisions

- Provider usage collection is a separate concern. The app composition may inject the reporter, while the agent's decisions and user-facing responses remain independent of reporting.
- This entry supersedes the characterization in [the preceding session](./2026-10-06-1227-provider-role-usage.md); that entry remains append-only history.

## Verification

- `npm run check` — passed: agentic validation, lint, both TypeScript checks, and 261 tests passed; three files skipped, two tests skipped, one todo.
- `git diff --check` — passed.
- No live provider requests were made.

## Unresolved

- The reporter is in-memory and does not estimate costs or track retries.
- The frozen-corpus comparison runner and production readiness work remain incomplete.

## Recommended Next Step

Run `npm run check`, then use this reporter from a dedicated evaluation runner that captures per-role timing and computes cost from an explicitly versioned rate card.
