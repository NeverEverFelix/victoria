# Session: Conversation Findings Reliability Review

- Date: 2026-10-29
- Time: 15:10 EDT
- Status: Partial; repository findings advanced and verified, external evaluation gates remain blocked
- Scope: Continue closing the conversation architecture review findings, especially evaluation correctness and outage behavior.

## Outcome

Added fail-closed coverage for unavailable durable pending-action storage, fixed the deterministic evaluation harness to distinguish per-turn intent from the runtime classification retained for a pending workflow, updated provider-readiness documentation, and reran local verification. The only remaining C10 evidence requires an available provider credential and blinded human reviewers; deployed reliability evidence requires the deployed environment.

## Work Completed

- Added an agent regression proving that a database error while restoring a pending proposal rejects a confirmation and creates no mocked savings entry in [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts).
- Added the fail-closed approval outage expectation to [test-plan.md](../test-plan.md). Existing SQLite outbox coverage continues to verify short-term context during PostgreSQL unavailability and backup retry.
- Corrected [run-mock-provider-comparison.ts](../../tests/evaluation/run-mock-provider-comparison.ts) to record a separate intent probe instead of treating the pending proposal's runtime classification as the intent of the current message. Tightened the mock classifier so hedged agreement remains unclear, with a regression test.
- Updated the [finding ledger](../architecture/conversation-architecture-spec-follow-up-2026-10-29.md), [multi-agent readiness checklist](../architecture/multi-agent-readiness.md), and [evaluation protocol](../architecture/multi-agent-evaluation-protocol.md) with the initial live report, the post-fix credential gap, current local PostgreSQL verification, and the still-unscored blinded review packet.

## Decisions

- The proposed p50 2.5 s, p95 5 s, hard 8 s, and 2x cost figures remain proposals; they are not treated as accepted product requirements.
- The mock comparison's scores are plumbing diagnostics and are not evidence of provider quality. Both deterministic arms passed the safety assertions but had low intent/action/amount match rates.
- Durable pending financial state remains authoritative in PostgreSQL in persistent mode. If that store is unavailable, an approval fails closed instead of using instance-local state.

## Verification

- `npm run check` — passed: 92 test files passed, 9 skipped; 935 tests passed, 25 skipped, 9 todo. One existing ESLint warning remains in `tests/unit/agent/memory-orchestrator.test.ts:146` (`_observedThrough`).
- `RUN_POSTGRES_MEMORY_CHAT_INTEGRATION=true APP_ENV=local NODE_ENV=development MONEY_MOVEMENT_MODE=mock_ledger DB_SSL=false DATABASE_URL=postgresql://postgres:local-only-password@127.0.0.1:5433/victoria_integration_local npx vitest run tests/integration/memory/postgres-persistent-chat.integration.test.ts` — passed, 18 tests.
- `npm run eval:provider:mock-comparison` — passed both 50-turn arms with zero safety failures; each arm had 21/50 intent, 27/50 action, and 36/50 amount matches.
- Attempted the post-fix live provider run with the explicit local confirmation flag and selected recovery cases. The runner stopped before provider calls because no usable `OPENAI_API_KEY` was available; no provider request was made.
- `git diff --check` — passed after final documentation edits.

## Unresolved

- C10: configure an approved provider key and dated rate card locally; rerun selected recovery cases and the frozen corpus; have two blinded human reviewers complete the packet and report score distributions.
- C11: post-fix financial-turn latency and cost measurement remains dependent on the provider rerun; numeric budgets remain unapproved proposals.
- C03/C07: local PostgreSQL restart/concurrency and local cache outage/retry behavior are covered; deployed multi-worker stress and hosted outage recovery remain unverified.
- C08/C09: held-out and human review of provider fallback quality and memory relevance remain outstanding.
- C12: durable per-stage trace storage remains excluded pending a retention/access decision.
- Existing unrelated untracked files ending in ` 2` remain untouched.

## Recommended Next Step

After an approved provider key and rate card are available in the local environment, rerun provider evaluation and blinded review. Separately, verify multi-worker and outage/recovery behavior in the intended staging environment before making deployment-readiness claims.
