# Session: Uncertain Proposal And Goal Handoffs

- Date: 2026-10-05
- Time: 11:38 EDT
- Status: Completed
- Scope: Continue headless multi-agent product work by closing uncertainty gaps in proposal revisions and goal allocation.

## Outcome

Low-confidence intent now retains bounded context for clarification, while uncertain proposal revisions and goal requests remain non-mutating until the user makes the intent clear. Proposal revisions still require fresh explicit approval.

## Work Completed

- Added an internal uncertain-intent annotation and passed unresolved context separately from the current message, avoiding repeated parsing of old amounts. See [confidence policy](../../src/agent/confidence-policy.ts), [LLM mock](../../src/agent/llm/mock-llm.ts), and [Victoria agent](../../src/agent/victoria-agent.ts).
- Added multi-turn scenarios for uncertain intent, estimate disagreement, specialist failure, proposal revision, and goal allocation. See [conversation evaluations](../../tests/evaluation/multi-agent-conversations.test.ts).
- Updated product failure guidance and expected behavior in [failure modes](../failure-modes.md) and the [test plan](../../tests/test-plan.md).

## Decisions

- Confirmed product behavior: low confidence asks for clarification; it is not approval. An uncertain proposal edit leaves the current proposal unchanged. A clarified edit supersedes it and requires fresh approval. An uncertain goal request creates no allocation; a clarified allocation also requires explicit approval.
- The 0.70 confidence floor remains provisional and is not calibrated to a real provider.

## Verification

- `npx vitest run tests/evaluation/multi-agent-conversations.test.ts tests/unit/agent/victoria-agent.test.ts tests/unit/agent/team-prototype.test.ts` — passed (88 tests).
- `npm run check` — passed (23 test files passed, 1 skipped; 232 tests passed, 1 todo), including agent setup validation, lint, and both TypeScript checks.
- `git diff --check` — passed.

## Unresolved

- Unresolved context and pending actions remain in process memory; this work does not provide restart or cross-instance continuity.
- Confidence behavior is exercised with deterministic mock specialists. Provider-backed calibration remains future work.
- The worktree contains broader pre-existing changes in the agent, turn lifecycle, and submission-boundary work; this entry describes only the uncertainty handoff slice.

## Recommended Next Step

Continue headless product behavior review with a multi-turn gap audit around corrections and goal-allocation targets, then decide whether the provisional confidence policy needs per-intent handling before adding a provider.
