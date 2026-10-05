# Session: Mock Specialists In The Core Agent

- Date: 2026-10-05
- Time: 10:31 EDT
- Status: Completed
- Scope: Wire deterministic specialist roles into Victoria's headless core agent while preserving deterministic financial authority.

## Outcome

The mock composition now uses Financial Moment for fresh-message classification and runs Savings Reasoning plus Companion Voice on avoided-spend, unclear, and regretful-spend turns. The core agent still determines product actions, and specialist suggestions must agree with its deterministic estimate before a proposal can be created.

## Work Completed

- Added [`mock-specialists.ts`](../../src/agent/team/mock-specialists.ts) and injected the mock team from [`create-victoria-agent.ts`](../../src/app/create-victoria-agent.ts).
- Integrated validated specialist classification, assessment, and response into [`victoria-agent.ts`](../../src/agent/victoria-agent.ts). Approval replies bypass specialists; progress, goal, and correction behavior stays in existing core handlers.
- Strengthened [`team-response-policy.ts`](../../src/agent/team-response-policy.ts) to reject shaming language and unsupported money amounts in companion drafts.
- Added integration tests for exact amounts, approval-gated recording, assessment disagreement, and core-handler routing; updated architecture and test-plan documentation.
- The user confirmed the development sequence: continue product and mock multi-agent behavior before production authentication/server work. This does not waive later production readiness gates.

## Decisions

- Deterministic mock specialists are wired into headless core composition until provider evaluation is ready.
- Specialist classifications and suggestions remain advisory. Proposal creation, approval, ledger mutation, and transfer refusal remain deterministic core responsibilities.
- No real model provider, UI, authentication provider, or durable storage was added in this slice.

## Verification

- `npm run check` passed: agent setup validation, lint, both TypeScript checks, and tests (216 passed, 1 todo, 1 skipped).
- `git diff --check` passed.

## Unresolved

- Mock behavior does not measure model quality, provider latency, token usage, or cost.
- Specialist prompt/schema versioning and provider-backed evaluation remain future work.
- The shared worktree also contains earlier turn repository and submission-boundary work; preserve it for review.

## Recommended Next Step

Expand headless product behavior tests for specialist/core disagreement and repeated conversation turns, then prepare a provider-neutral specialist adapter and evaluation set before choosing a real model provider.
