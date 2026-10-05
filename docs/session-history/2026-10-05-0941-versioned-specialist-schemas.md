# Session: Versioned Specialist Schemas

- Date: 2026-10-05
- Time: 09:41 EDT
- Status: Completed
- Scope: Add strict, versioned input and output handoffs for the staged financial and voice specialists.

## Outcome

Financial Moment, Savings Reasoning, and Companion Voice now use version 1 handoff envelopes validated with strict Zod schemas. Specialist output is treated as untrusted data; unsupported versions, extra keys, and invalid nested values fail closed before entering policy-sensitive orchestration.

## Work Completed

- Added role-specific strict schemas in [handoff-schemas.ts](../../src/agent/specialists/handoff-schemas.ts).
- Updated specialist interfaces and coordinator parsing, including deterministic clarification on invalid financial output and deterministic voice fallback on invalid voice output.
- Added tests for unsupported schema versions, extra fields at nested and top-level boundaries, and versioned voice input/output.
- Updated the [agent work queue](../agent-work-queue.md), [readiness review](../architecture/specialist-runtime-readiness.md), [agent module documentation](../../src/agent/README.md), and [test plan](../../tests/test-plan.md).

## Decisions

- Confirmed for the staged path: handoff schema version is `1`; each specialist role has a strict allowlist, with no unknown keys accepted.
- Live provider wiring remains disabled. Provider-specific serialization and token/cost budgets remain future work.

## Verification

- `npm run check` passed: 18 test files passed, 1 skipped; 188 tests passed, 20 todo.
- ESLint reported two existing warnings in `src/agent/memory/mock-memory.ts` for unused `_userId` parameters.
- `git diff --check` passed before the session record was written.

## Unresolved

- The model adapter's provider-specific request/response serialization still needs a bounded contract.
- No total turn/cost budget or durable turn/trace persistence exists.
- Current worktree includes earlier uncommitted multi-agent slices from this work sequence.

## Recommended Next Step

Implement total turn deadlines and per-role call/output/cost budgets while keeping live providers disabled.
