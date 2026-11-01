# Session: Extract Deterministic Clarification Policy

- Date: 2026-10-28
- Time: 11:41 America/New_York
- Status: Completed
- Scope: Move clarification wording selection out of the Victoria agent orchestrator.

## Outcome

Clarification messages are now selected by a standalone pure policy function. Existing wording and precedence are preserved.

## Work Completed

- Added [clarification-policy.ts](../../src/agent/clarification-policy.ts) and replaced the inline message selection in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added direct tests in [clarification-policy.test.ts](../../tests/unit/agent/clarification-policy.test.ts) for intent-specific clarifications, amount validation issues, and the general fallback prompt.
- Updated F10 evidence in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- Keep the current precedence: goal allocation, proposal revision, and entry correction clarifications take priority over amount issues.
- This extraction changes no approval, proposal, or ledger behavior. Routing and workflow state remain in `VictoriaAgent`; F10 remains open.

## Verification

- Focused policy tests: 3 passed.
- `npm run check`: passed; 87 test files passed, 9 skipped; 802 tests passed, 25 skipped, 9 todo.
- `git diff --check`: passed.
- Existing lint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:146` for `_observedThrough` being unused.

## Unresolved

- The orchestration and workflow branches remain largely in `VictoriaAgent`.
- The worktree contains extensive unrelated uncommitted changes and was preserved.

## Recommended Next Step

Extract one additional deterministic decision policy only where it has a clear input/output contract and can be parity-tested independently.
