# Session: Cover provider specialist failures

- Date: 2026-10-06
- Time: 11:23 America/New_York
- Status: Completed locally
- Scope: Extend mocked integration coverage for provider-backed specialist failures and response safety.

## Outcome

Added regression coverage showing that unavailable Savings Reasoning asks for clarification without a proposal, and unavailable Companion Voice falls back to deterministic confirmation wording. Provider team requests are also checked for strict structured output and absence of tools.

## Work Completed

- Extended [create-victoria-agent tests](../../tests/unit/app/create-victoria-agent.test.ts) for provider response schemas, Savings Reasoning outage, and Companion Voice outage with explicit approval after fallback.
- Verified transfer requests stop after the Financial Moment provider classifies them; other specialists are not called.

## Decisions

- Provider failures continue through the existing safe degradation path; no retry or alternate provider was added.
- Savings proposals remain pending until the user's exact approval, even when voice generation fails.

## Verification

- `npm run check` — passed: agentic setup validation, lint, both TypeScript checks, and 257 tests passed; two test files skipped, one test skipped, and one todo.
- No live provider calls were made.

## Unresolved

- Live behavior with an API key remains unverified.
- Provider usage and cost telemetry are not yet connected across all three roles.

## Recommended Next Step

Run the provider team locally against a real API key when available, inspect role output and failure behavior, and then add lightweight per-role usage reporting before any wider rollout.
