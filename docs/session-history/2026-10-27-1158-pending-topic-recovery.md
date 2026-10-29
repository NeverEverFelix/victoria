# Session: Preserve read-only conversation during pending proposals

- Date: 2026-10-27
- Time: 11:58 America/New_York
- Status: Partial
- Scope: Address the pending-proposal conversation gap identified in the conversational-core deep dive.

## Outcome

Read-only financial reflections classified as general finance, pattern reflection, or savings progress can now pass a pending proposal even when phrased without question punctuation. If a generated read-only reply fails validation, Victoria gives the responder one retry before using the safe baseline. Neither path grants approval or mutation authority.

## Work Completed

- Updated pending-action routing in [victoria-agent.ts](../../src/agent/victoria-agent.ts) to recognize classified read-only reflections independently of punctuation.
- Added one validated retry for a rejected conversational draft. Approval and tool execution remain outside the responder.
- Added regressions for an anxious money-related statement during a pending proposal and for the detailed rainy-weekend challenge after a rejected action-claiming draft. Both verify that the pending proposal remains available for later explicit approval.
- Updated the behavior contract in [mvp.md](../mvp.md), [test-plan.md](../../tests/test-plan.md), and [agent-work-queue.md](../agent-work-queue.md).

## Decisions

- Confirmed behavior: a read-only financial reflection can be answered while a mocked-ledger proposal remains pending; it does not approve, decline, revise, or record the proposal.
- Confirmed behavior: a rejected generated draft receives one correction attempt; a second rejection or provider error returns the existing safe baseline.
- The remaining findings in [the conversational-core deep dive](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md), including canonical typed context, historical-reference resolution breadth, memory/episode policy, and orchestrator decomposition, remain open for separate slices.

## Verification

- `npm run check`: passed; 77 test files passed, 9 skipped; 718 tests passed, 23 skipped, 9 todo.
- Focused agent tests after the final test-mock cleanup: 2 files passed, 139 tests passed.
- ESLint on changed TypeScript files and `git diff --check`: passed.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted existing experimental SQLite warnings.

## Unresolved

- No provider-backed live replay was run in this session; the revised response-recovery path is covered with a deterministic responder test.
- The deep dive includes additional architectural and memory findings that are not addressed by this slice.
- The worktree already contained unrelated uncommitted changes before this session; they were preserved.

## Recommended Next Step

Trace the provider-backed detailed topic-shift scenario with privacy-safe rejection-reason diagnostics, then implement and test the common unique/ambiguous/no-match historical-event reference contract without allowing it to authorize financial mutations.
