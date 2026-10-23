# Session: Hosted Persistent Chat Identity

- Date: 2026-10-21
- Time: 15:31 America/New_York
- Status: Partial
- Scope: Connect hosted persistent chat to the same verified identity and memory controls used by Supabase-backed memory management.

## Outcome

Added staging/production chat composition backed by PostgreSQL. Both chat and memory controls verify Supabase Auth bearer tokens and derive user scope from the returned subject. Hosted chat uses PostgreSQL directly for context and durable memory, pending approvals, and mocked ledger actions.

## Work Completed

- Added [persistent chat runtime](../../src/app/http/create-persistent-chat-runtime.ts) and routed hosted chat requests through it while preserving local mock routing.
- Reused Supabase Auth bearer verification for hosted chat and memory management; wired durable context, memory retrieval, pending clarification/proposal stores, mock savings tools, and per-conversation serialization.
- Updated [agent composition](../../src/app/create-victoria-agent.ts) to accept durable pending-action stores.
- Updated [routes](../../app/api/victoria/%5BconversationId%5D/route.ts), [memory collection](../../app/api/memories/route.ts), and [forget route](../../app/api/memories/%5BmemoryId%5D/forget/route.ts).
- Updated [MVP](../mvp.md), [user stories](../user-stories.md), [test plan](../../tests/test-plan.md), [environment guide](../environments.md), [work queue](../agent-work-queue.md), [README](../../README.md), and [decisions](../decisions.md).

## Decisions

- Confirmed: staging and production chat share Supabase Auth identity with memory inspect/correct/forget controls.
- Confirmed: hosted chat uses PostgreSQL directly; local SQLite is not used for deployed state.
- Hosted chat still requires the trusted client sign-in flow, hosted migration application/verification, and staging endpoint verification before rollout.

## Verification

- `npm run check` passed: 481 tests passed, 15 skipped, and 9 todo.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for unused `_observedThrough`; Node emitted existing experimental SQLite warnings.
- `git diff --check` passed.
- No hosted database, Supabase Auth endpoint, client sign-in, or Vercel deployment was exercised.

## Unresolved

- Hosted migrations `0010`–`0017` must be applied and verified before chat operations can rely on all durable approval tables; production also requires migration `0009` for the restricted memory API role.
- Trusted client sign-in must issue Supabase Auth access tokens; staging endpoint verification remains pending.
- The existing outstanding memory retention/deletion and pending savings-correction restoration gaps remain.

## Recommended Next Step

Apply the required migration set to the staging project through the reviewed Supabase workflow, configure a trusted client sign-in using Supabase Auth, and verify chat continuity, cross-user isolation, and memory inspect/correct/forget against staging.
