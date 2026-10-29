# Session: Conversation Architecture Follow-up

- Date: 2026-10-29
- Time: 14:51 EDT
- Status: Completed for code-addressable findings; live provider re-evaluation and external quality review remain open
- Scope: Continue the C01–C12 review work, resolve provider evaluation failures, and verify the current headless implementation.

## Outcome

Completed the current code, test, and documentation work for the actionable conversation architecture findings. The repo now records the user's confirmed split between conversational interpretation, typed factual/state services, and deterministic monetary policy. The full repository check passes. Provider-backed follow-up evaluation could not run because no usable API key was available in the current local environment.

## Work Completed

- Extended the [finding ledger](../architecture/conversation-architecture-spec-follow-up-2026-10-29.md) with the user's confirmed architecture direction, all C01–C12 statuses, measured initial provider comparison results, and remaining work.
- Added durable 24-hour expiry handling for savings, goal-allocation, and correction proposals using append-only `expired` transitions; aligned [environment policy](../environments.md), the MVP safety contract, user stories, and tests.
- Added neutral fail-closed clarification when Financial Moment provider classification fails. Classifier fallback emits only a categorized, content-free diagnostic and makes no financial state change.
- Hardened provider comparison reporting so malformed output, timeout, or state setup failure is recorded per turn and does not abort the corpus. Added optional selected-case execution for provider recovery evaluation.
- Kept remembered spending-habit names separate from amount evidence sent to the classifier. The typed savings reasoning service remains responsible for any historical estimate. Added lexical grounding, parser coverage for trailing punctuation, and regression coverage for user-stated amounts.
- Tightened savings-progress classification, unrelated topic handling during pending approval, and mock-ledger wording. A topic switch does not approve a pending action; a vague “yes” does not write.
- Ran the focused suite: 247 tests passed across seven files.
- Ran `npm run check`: agent setup validation, lint, app typecheck, test typecheck, and 931 tests passed; 25 skipped and 9 todo. One existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts:146` for `_observedThrough`.
- Ran the local PostgreSQL-backed persistence suite after applying migrations to a dedicated loopback integration database: 18 tests passed, including restart and concurrent approval coverage. Episodic source-turn provenance now retains a bounded user-message reference, and correction suppression is asserted through the runtime lifecycle filter.
- `git diff --check` passed. Existing untracked artifacts ending in ` 2` were preserved.

## Decisions

- The user confirmed: conversational models handle interpretation, explanation, continuity, and phrasing; typed services handle factual retrieval, calculations, permissions, and financial state changes; deterministic policy validates any requested monetary operation. This is recorded in [decisions.md](../decisions.md).
- Pending proposals expire after 24 hours; expiration is recorded as an immutable transition and does not delete financial history.
- The initial live 50-turn comparison remains diagnostic evidence only because it predates the latest fixes. Baseline: 47/50 completed, zero safety failures, p50/p95 latency 2.235/3.874 seconds, estimated cost $0.07455. Specialist team: 50/50 completed, zero safety failures, p50/p95 latency 5.441/10.002 seconds, estimated cost $0.13573. Raw report: `tests/evaluation/reports/provider-comparison-2026-10-29.json`.
- Do not add durable per-stage traces until retention and access controls are decided. Existing traces remain content-free.
- No hosted migration, deployment, or real money movement was performed.

## Verification

- Focused tests: `npx vitest run tests/unit/domain/financial-events.test.ts tests/unit/agent/openai-financial-moment.test.ts tests/unit/agent/victoria-agent.test.ts tests/unit/agent/conversation-fallback.test.ts tests/unit/agent/conversation-responder.test.ts tests/unit/app/postgres-pending-workflow-expiry.test.ts tests/evaluation/provider-comparison.test.ts` — 7 files passed, 247 tests passed.
- Full check: `npm run check` — passed; 92 files passed, 9 skipped; 931 tests passed, 25 skipped, 9 todo.
- PostgreSQL integration: `RUN_POSTGRES_MEMORY_CHAT_INTEGRATION=true APP_ENV=local NODE_ENV=development MONEY_MOVEMENT_MODE=mock_ledger DB_SSL=false DATABASE_URL=postgresql://postgres:local-only-password@127.0.0.1:5433/victoria_integration_local npx vitest run tests/integration/memory/postgres-persistent-chat.integration.test.ts` — 18 tests passed.
- Attempted the focused post-fix live provider comparison with cases P10, P12, P16, P17, P20, P32, P35, P40, and P48. It stopped before provider calls because no usable `OPENAI_API_KEY` was available; no new API charge or report was produced.
- `git diff --check` — passed.

## Unresolved

- C10 needs a post-fix provider rerun and blinded human quality review; current local credentials do not permit another provider run.
- C11 needs optimization or a deliberate latency/cost product decision; the initial specialist comparison exceeded the proposed latency targets.
- C03 restart and concurrent approval have local PostgreSQL integration coverage; outage/recovery and deployed multi-worker stress remain unverified. No remote database was changed.
- C08 retains guarded deterministic recovery paths pending equivalent held-out quality evidence.
- C12 durable trace aggregation needs a retention/access policy.
- Pre-existing untracked files ending in ` 2` remain untouched.

## Recommended Next Step

After configuring the approved local provider environment, rerun the selected recovery cases and then the frozen 50-turn corpus. In parallel, run the PostgreSQL restart/concurrency/outage suite locally and complete blinded review before changing specialist routing or fallback coverage.
