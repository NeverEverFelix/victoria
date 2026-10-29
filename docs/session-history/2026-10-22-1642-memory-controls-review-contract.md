# Session: Memory Controls Review Contract

- Date: 2026-10-22
- Time: 16:42 America/New_York
- Status: Complete for the headless API contract
- Scope: Make authenticated memory inspection useful for activity personalization and ensure structured corrections preserve valid memory semantics.

## Outcome

The existing authenticated memory controls now return allowlisted structured review details for user-reported activity spend, user-confirmed activity mappings, and transaction-profile aggregates. Structured interest/spend/mapping corrections require a clear first-person statement and are re-extracted; transaction-derived aggregates cannot be edited through PATCH. Existing single-fact forgetting remains unchanged.

## Work Completed

- Added a safe public `details` projection in [memory-management-handler.ts](../../src/app/http/memory-management-handler.ts). Arbitrary `sourceMetadata`, raw provider payloads, and internal linked profile keys are not returned.
- Updated [MemoryOrchestrator.correctMemory](../../src/agent/memory/memory-orchestrator.ts) to append structured corrections for hobbies, recurring activity spend, and activity mappings. Corrections preserve the old record and supersede it. Transaction-profile aggregates reject direct correction.
- Added route/orchestrator coverage for public provenance, no internal metadata leakage, inactive-interest correction, mapping correction, malformed structured correction, and read-only transaction-profile facts in [memory-management-handler.test.ts](../../tests/unit/app/memory-management-handler.test.ts).
- Updated [Story 16](../user-stories.md), the [memory schema](../specification/user-learning-schema.md), and [test plan](../../tests/test-plan.md).

## Decisions

- Confirmed: user-visible inspection must distinguish user-reported amounts, user-confirmed mappings, and transaction-derived totals.
- Confirmed: transaction-derived aggregates remain read-only through memory correction; users can correct a mapping or forget the aggregate fact.
- Confirmed: memory-management actions stay authenticated, owner-scoped, and append-only.
- The review UI remains deferred. The current `AGENTS.md` headless-first rule allows UI work only after every non-UI MVP slice is complete and verified; the work queue still lists non-UI staging and lifecycle verification gaps.

## Verification

- `npx vitest run tests/unit/app/memory-management-handler.test.ts tests/unit/agent/memory-orchestrator.test.ts` passed: 17 tests.
- `npm run check` passed: 518 tests passed, 15 skipped, and 9 todo; 7 test files skipped.
- Existing ESLint warning for `_observedThrough` and Node SQLite experimental warnings remain.
- Hosted endpoint verification was not run in this session; staging URL and signed-in credentials are still required.

## Unresolved

- There is still no user-facing page for browsing, correcting, or forgetting memories.
- Hosted staging authorization and memory-management smoke checks remain outstanding.
- The workspace contained substantial pre-existing uncommitted changes; they were preserved and are not attributed to this session.

## Recommended Next Step

Run the existing two-user staging authorization check and verify hosted GET/PATCH/forget against current staging. Start a memory review UI only after the remaining non-UI MVP slices pass the repository check, or after the user changes the headless-first sequencing rule.
