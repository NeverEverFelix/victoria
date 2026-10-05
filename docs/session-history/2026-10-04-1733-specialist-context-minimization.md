# Session: Specialist Context Minimization

- Date: 2026-10-04
- Time: 17:33 EDT
- Status: Completed
- Scope: Minimize context passed to Financial Moment and Savings Reasoning specialists while preserving deterministic user-scoped tool access.

## Outcome

The staged specialist path no longer sends `AgentMemory` or user IDs into Financial Moment or Savings Reasoning inputs. Savings estimation remains within the coordinator's deterministic tool boundary and runs only after the savings specialist returns a usable recommendation state.

## Work Completed

- Removed memory from Financial Moment and model classification input contracts.
- Replaced full-classification and user-ID Savings Reasoning input with allowlisted avoided-spend facts.
- Kept user ID binding inside `VictoriaAgent`'s deterministic estimate callback; specialists receive no tool handle.
- Added specialist input boundary tests and updated [the test plan](../../tests/test-plan.md), [work queue](../agent-work-queue.md), and [runtime readiness review](../architecture/specialist-runtime-readiness.md).

## Decisions

- Confirmed for this staged path: user IDs and tool handles stay in deterministic orchestration; specialist context is limited to fields required for that role.
- Live model use remains disabled. Strict versioned schemas, turn/cost budgets, and durable state remain follow-up work.

## Verification

- `npm run check` passed: 18 test files passed, 1 skipped; 185 tests passed, 20 todo.
- ESLint reported two existing warnings in `src/agent/memory/mock-memory.ts` for unused `_userId` parameters.
- `git diff --check` passed.

## Unresolved

- Specialist handoff schemas still accept unversioned or extra fields in some boundaries.
- No total turn/cost budget or durable turn/trace persistence exists.
- Current worktree includes earlier uncommitted multi-agent slices from this work sequence.

## Recommended Next Step

Implement strict, versioned specialist handoff schemas and reject unknown fields at coordinator boundaries; keep live specialist use disabled.
