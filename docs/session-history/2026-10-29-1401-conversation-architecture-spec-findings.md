# Session: Conversation Architecture Spec Findings

- Date: 2026-10-29
- Time: 14:07 EDT
- Status: Completed for code-addressable findings; remaining policy and live-evaluation gaps documented
- Scope: Verify the attached conversation architecture review against the active checkout and fix actionable response-interruption, restart-targeting, and dialogue-intent gaps.

## Outcome

Removed the successful memory-learning early return, made recent completed savings entries recoverable from user-and-conversation scoped history after agent restart, and extended the contextual intent plan with dialogue-act and pending-workflow relation tags, action-request descriptions, uncertainty, and ambiguity hints. Recorded the status of every C01–C12 review finding, including items already implemented and those still requiring product policy or live evaluation evidence.

Checkout began on `feature/victoria-agent-core` at `40a95b7f68e1df80ff77bb96b81ddc8dc00a8f46`.

## Work Completed

- Removed the memory-extraction early return from [victoria-agent.ts](../../src/agent/victoria-agent.ts); learning no longer replaces the normal response path.
- Added an agent regression proving a question is answered while one supported user routine is saved and no ledger entry is created in [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts).
- Added scoped recovery of the latest completed entry by joining the user's conversation events to their mocked ledger entries. Added a restart regression for correction targeting, including another conversation for the same user.
- Added dialogue interpretation and the new behaviors to [test-plan.md](../../tests/test-plan.md).
- Added descriptive plan-vs-mock-record-vs-real-movement intent and unresolved referent reporting to [conversation-intent-plan.ts](../../src/agent/conversation-intent-plan.ts). Tests cover negated movement requests, uncertainty, attempted confirmation, mixed revisions, and ambiguous contextual references. These plan fields do not authorize financial actions.
- Added a C01–C12 implementation and evidence ledger at [conversation-architecture-spec-follow-up-2026-10-29.md](../architecture/conversation-architecture-spec-follow-up-2026-10-29.md).

## Decisions

- The attached engineering spec is treated as a review and backlog, not a product contract. `docs/mvp.md`, `docs/user-stories.md`, and the MVP safety contract remain authoritative.
- User-and-conversation scoped event history is authoritative when a persistent event store is configured; in-memory maps remain a compatibility/cache path.
- Pending financial proposals remain durable and exact-action-bound, with append-only terminal transitions and per-conversation transaction coordination. No new universal expiry duration or optimistic version fields were invented: the product contract does not define a timeout, and the persistent runtime serializes turns and stores immutable workflow snapshots. The existing short-lived amount clarification has its own TTL.
- No real money movement, UI work, migrations, runtime profile changes, or production claims were introduced.

## Verification

- Targeted regressions passed: 212 tests across the intent-plan and agent suites.
- `npm run check` passed: agent setup validation, lint, application/test typechecks, and full suite; 91 files passed, 9 skipped; 910 tests passed, 25 skipped, 9 todo.
- One pre-existing lint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:146` (`_observedThrough` unused).
- `git diff --check` passed after the implementation and before this final session-history edit.
- Provider-backed held-out quality evaluation, live PostgreSQL restart/concurrency/outage testing, latency/cost measurement, and deployment verification were not run. Authorization to make paid provider calls was requested; no paid API calls were made.

## Unresolved

- C03 uses specialized durable stores rather than a unified versioned repository; a universal workflow expiry policy remains undefined.
- C04 has a deterministic contextual intent plan, but provider-backed multi-domain interpretation has not been quality-evaluated.
- C07 still uses a 20-message context cap without durable summary coverage checkpoints.
- C06 does not centralize all deployment choices in a named runtime-profile type. C08 retains guarded topic-specific fallbacks. C10 needs live held-out provider and human-reviewed evaluation. C11 has measurement scaffolding but no live baseline. C12 has content-free in-process traces and provider usage collection, but no durable per-stage trace. Full details are in the finding ledger.
- Pre-existing untracked files ending in ` 2` were not modified.

## Recommended Next Step

Set explicit pending-workflow expiry and conversation-summary coverage policies, authorize the paid held-out provider evaluation, then run it alongside a live PostgreSQL restart/concurrency challenge before expanding provider interpretation or removing guarded fallbacks.
