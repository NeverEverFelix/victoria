# Session: Pending workflow action routing

- Date: 2026-10-28
- Time: 11:57 America/New_York
- Status: Completed
- Scope: Keep direct correction-revision and goal-retarget requests inside their pending approval workflows while preserving read-only topic switching.

## Outcome

Pending correction and goal-allocation branches now share the safe topic-switch predicate. A clear replacement request supersedes the old pending version; the user must request and approve a fresh version.

## Work Completed

- Added test-first agent regressions for a request to change a pending $24 correction to $25 and for a request to retarget an Emergency fund allocation to Travel. Both reproduced a general-responder routing leak before the fix. Tests also verify a bare “yes” cannot approve the stale proposal and that the replacement amount/goal requires fresh confirmation.
- Renamed and generalized the pending-workflow topic-switch helper; extended explicit financial-action question detection to include allocation and edit verbs.
- Pending replacement requests supersede their old correction or goal-allocation action. Existing persistence interfaces record the terminal superseded status, and follow-up requests create new approval-gated proposals.
- Documented F6 progress in the [conversational core review](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md) and [test plan](../../tests/test-plan.md).

## Decisions

- Confirmed behavior: unrelated read-only topic switches can pass a pending financial workflow. A clear replacement request supersedes its old pending version without mutating the ledger; the new version requires separate explicit approval.
- Broader separation of dialogue state and financial workflow state remains proposed work under F6.

## Verification

- `npx vitest run tests/unit/agent/victoria-agent.test.ts tests/unit/agent/conversation-routing.test.ts` — passed, 160 tests.
- `npm run check` — passed; 88 test files passed, 9 skipped; 811 tests passed, 25 skipped, 9 todo.
- `git diff --check` — passed.
- Existing ESLint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:146` for unused `_observedThrough`; SQLite experimental warnings also remain.

## Unresolved

- F6 remains partial: pending-action branches and dialogue routing still live in the large `VictoriaAgent` orchestrator; exact-version approval/state separation remains incomplete.
- F10 and F11 remain open according to the review status table.
- This checkout has extensive unrelated uncommitted and untracked work from prior sessions; no unrelated changes were reverted.

## Recommended Next Step

Continue with another focused F6 slice: audit direct action and revision requests across all three pending workflow types, including savings proposal revision paths, and extend the same narrowly scoped regression pattern where a concrete routing leak exists.
