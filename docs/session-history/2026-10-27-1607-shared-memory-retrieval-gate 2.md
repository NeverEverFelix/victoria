# Session: Shared memory retrieval gate

- Date: 2026-10-27
- Time: 16:07 America/New_York
- Status: Partial
- Scope: Continue F8 by aligning provenance eligibility across structured context, retrieval ranking, and personalized replies.

## Outcome

Memory retrieval consumers now share a strict provenance and shape gate. Direct extracted records that omit their source type are normalized to `user_statement`, avoiding adapter-specific behavior.

## Work Completed

- Added `isRetrievableMemory` to [retrieval-planner.ts](../../src/agent/memory/retrieval-planner.ts) and applied it in the planner, [conversation-context-builder.ts](../../src/agent/conversation-context-builder.ts), and personalization in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- The common gate requires explicit user statement/correction provenance, confidence >= 0.85, active interest status, and bounded nonempty ID, key, value, and evidence.
- [memory-orchestrator.ts](../../src/agent/memory/memory-orchestrator.ts) now explicitly defaults trusted memory writes to `user_statement` when omitted, matching PostgreSQL's default in other storage adapters.
- Added retrieval policy coverage in [retrieval-planner.test.ts](../../tests/unit/agent/memory/retrieval-planner.test.ts) and updated [test-plan.md](../../tests/test-plan.md) and the F8 note in [VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md).

## Decisions

- Keep the existing 0.85 confidence threshold and accepted provenance types unchanged.
- Preserve explicitly supplied correction, profile, and inference source types.

## Verification

- Four focused memory and agent test files passed (104 tests).
- `npm run check` passed: 84 test files passed, 9 skipped; 757 tests passed, 24 skipped, 9 todo.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted experimental SQLite warnings.

## Unresolved

- F8's query rewriting, per-type budgets, and expanded episodic retrieval remain open proposals.
- The worktree contains other in-progress changes from earlier sessions; this entry covers only the shared retrieval gate and provenance normalization.

## Recommended Next Step

- Add a focused agent-level regression confirming an unprovenanced legacy record cannot influence a personalized response, while a valid user-statement preference still can.
