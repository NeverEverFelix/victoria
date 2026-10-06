# Session: OpenAI Financial Moment Adapter

- Date: 2026-10-05
- Time: 15:09 EDT
- Status: Partial
- Scope: Add an opt-in provider-backed Financial Moment classifier and a smoke evaluation path without changing approval or ledger authority.

## Outcome

Victoria can route Financial Moment classification through an OpenAI Responses adapter when explicitly enabled. The adapter uses strict structured output, independently validates output, derives monetary amounts only from deterministic parsing of the current user message, and leaves Savings Reasoning and Companion Voice on deterministic mocks. Provider failure falls back to clarification. A seven-case opt-in evaluation command is available; it was not run against a live provider.

## Work Completed

- Added [OpenAI Financial Moment adapter](../../src/agent/llm/openai-financial-moment.ts) with versioned schema/prompt, bounded request timeout, no tools, no response storage, usage capture, schema validation, and evidence checks for merchant/goal/revision fields.
- Added the default-off `OPENAI_FINANCIAL_MOMENT_ENABLED` flag and wired the adapter through [agent composition](../../src/app/create-victoria-agent.ts). Existing mock composition remains default.
- Added request/response and failure-fallback coverage in [adapter tests](../../tests/unit/agent/openai-financial-moment.test.ts) and [composition tests](../../tests/unit/app/create-victoria-agent.test.ts).
- Added the opt-in `npm run eval:provider:financial-moment` smoke run and usage/latency report across the seven starter cases. See [evaluation notes](../../tests/evaluation/README.md).
- Updated [environment docs](../environments.md), [multi-agent readiness](../architecture/multi-agent-readiness.md), and the [work queue](../agent-work-queue.md).

## Decisions

- Confirmed for this slice: the provider classifies Financial Moment only; deterministic policy retains proposal, approval, and ledger authority.
- Confirmed: provider routing is disabled unless `OPENAI_FINANCIAL_MOMENT_ENABLED=true`; test/local examples leave it off.
- The model name remains environment-configured. Model selection for quality evaluation and production remains unresolved.

## Verification

- Focused adapter, composition, config, and evaluation tests passed (40 passed, 1 skipped).
- `npm run check` passed: setup validation, lint, TypeScript checks, and 249 tests passed, 1 skipped, 1 todo.
- `git diff --check` passed.
- Live provider evaluation was not run; it requires an explicitly supplied API key and selected model and may incur API charges.

## Unresolved

- The provider smoke evaluation covers seven cases only; the readiness gate requires a frozen corpus of at least 50 cases, a same-provider baseline comparison, and blinded human review.
- The evaluation captures tokens and latency but not estimated cost or retry count.
- No provider-backed Savings Reasoning or Companion Voice is implemented.
- Production still lacks a production authenticator, durable turn/proposal persistence, and cross-instance coordination.

## Recommended Next Step

Select the model and provide the evaluation credentials, then run the seven-case smoke check. If it passes, expand and freeze the 50-turn corpus and add baseline/human-review reporting before considering a controlled runtime rollout.
