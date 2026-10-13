# Session: Expose usage records for all provider roles

- Date: 2026-10-06
- Time: 12:27 America/New_York
- Status: Completed locally
- Scope: Add role-tagged provider usage and request-ID callbacks needed by the multi-agent evaluation report.

## Outcome

The headless agent composition can now report token usage and provider request IDs for successful Financial Moment, Savings Reasoning, and Companion Voice responses. This is instrumentation only; the frozen 50-turn comparison runner, cost aggregation, persistence, and production runtime remain unfinished.

## Work Completed

- Added the `OpenAiProviderUsage` role-tagged record and wired it through [create-victoria-agent.ts](../../src/app/create-victoria-agent.ts).
- Captured usage metadata and `x-request-id` from successful Savings Reasoning and Companion Voice responses in [openai-specialists.ts](../../src/agent/team/openai-specialists.ts).
- Added unit coverage for all three roles and documented the instrumentation boundary in [evaluation README](../../tests/evaluation/README.md) and [multi-agent readiness](../architecture/multi-agent-readiness.md).

## Decisions

- Provider outputs remain advisory. Usage callbacks expose metadata only and do not change proposal, approval, ledger, or real-money behavior.
- Production database/hosting choices and the production execution boundary remain unresolved; no production route or durable adapter was introduced.

## Verification

- `npm run check` — passed: agentic validation, lint, both TypeScript checks, and 260 tests passed; three files skipped, two tests skipped, one todo.
- No live provider requests were made.

## Unresolved

- There is still no complete two-arm runner consuming the frozen 50-turn corpus. The current single-agent provider adapter cannot draft user-facing responses, and stateful corpus cases need explicit pending-action/ledger setup.
- Cost reporting and retry accounting are not implemented.
- Durable conversation state, verified production authentication, server routes, and cross-process coordination remain production readiness gaps.

## Recommended Next Step

Build a provider-backed complete-turn comparison for a stateless frozen case such as P01, including a single-agent response path and role-level timing/usage capture. Define explicit deterministic setup for P31–P35 and P50 before expanding to the full corpus. Keep the provider opt-in and ledger mock-only.
