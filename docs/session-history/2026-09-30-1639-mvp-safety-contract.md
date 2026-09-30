# Session: MVP Safety Contract And Executable Traceability

- Date: 2026-09-30
- Time: 16:39 EDT
- Status: Completed
- Scope: Define a normative safety contract for Victoria's headless mocked-ledger MVP and make its rules traceable to executable or explicitly pending test scenarios.

## Outcome

Victoria now has a single normative safety specification covering financial invariants, agent and deterministic-code responsibilities, typed intents and proposals, approval, state transitions, money rules, idempotency, immutable corrections, failures, and honest user-visible wording.

## Work Completed

- Added the normative contract at [`docs/specification/mvp-safety-contract.md`](../specification/mvp-safety-contract.md), including:
  - Stable `FIN`, `ARC`, `INT`, `APR`, `STA`, `AMT`, `IDM`, `COR`, `ERR`, and `AUD` rule identifiers.
  - Approval, intent, state-transition, and amount decision tables.
  - Positive examples, counterexamples, implementation status, and test traceability.
  - Explicit separation between enforced, type-enforced, specified, and deferred behavior.
- Added passing cross-boundary scenarios in [`tests/contracts/mvp-safety-contract.test.ts`](../../tests/contracts/mvp-safety-contract.test.ts).
- Added an explicit pending-scenario register in [`tests/contracts/mvp-safety-contract.pending.test.ts`](../../tests/contracts/mvp-safety-contract.pending.test.ts). Pending scenarios are visible without falsely claiming that unimplemented behavior is enforced.
- Added [`tests/contracts/mvp-safety-contract-traceability.test.ts`](../../tests/contracts/mvp-safety-contract-traceability.test.ts), which fails when a normative rule lacks a scenario reference.
- Linked the specification from repository and testing guidance in [`README.md`](../../README.md), [`AGENTS.md`](../../AGENTS.md), [`docs/agentic-coding-patterns.md`](../agentic-coding-patterns.md), [`tests/README.md`](../../tests/README.md), and [`tests/test-plan.md`](../../tests/test-plan.md).

## Decisions

- Confirmed: the specification is normative only for the headless mocked-ledger MVP; real transfers, provider settlement, FX, and regulatory behavior remain deferred.
- Confirmed: model output may supply interpretations and proposals, but deterministic code owns validation, authorization, state transitions, totals, and idempotency.
- Confirmed: user-entered amounts with excessive precision must be clarified rather than silently rounded; rounding remains allowed for trusted deterministic calculations under a documented rule.
- Confirmed: an implementation slice is not complete while one of its applicable rules is still only `Specified`.
- No exact correction/reversal record shape was chosen. That existing product question remains unresolved.

## Verification

- `npm run check` passed.
- 14 test files passed and 1 pending-scenario file was reported as skipped.
- 88 tests passed; 27 scenarios remain explicitly marked `todo`.
- Lint completed with three pre-existing warnings in `src/agent/memory/mock-memory.ts` and `tests/unit/agent/policy.test.ts`.

## Unresolved

- Persisted money values do not yet have a positive safe-integer validation boundary.
- Ambiguous approval language does not yet have a deterministic interpreter.
- Idempotency is currently process-local; durable uniqueness and lost-response retries are unimplemented.
- Correction records, effective totals after correction, and runtime append-only enforcement are unimplemented.
- User-provided exact amounts still receive generic estimate wording.
- The worktree already contained uncommitted product, domain, and session-history changes before this session; they were preserved.

## Recommended Next Step

- Use the contract to complete the current domain-contract slice: finish proposal/suggestion identity and audit fields, tighten the mocked ledger entry shape, and turn the applicable `INT`, `FIN`, and `AUD` pending scenarios into passing tests before changing runtime behavior.

## Subsequent Repository Instruction Update

- The user explicitly replaced all earlier `AGENTS.md` instructions with the current repository instructions.
- The required pre-change reading list now includes [`docs/specification/mvp-safety-contract.md`](../specification/mvp-safety-contract.md) and the latest relevant session history.
- The replacement instructions preserve the mocked-ledger boundary, headless-first sequencing, test-driven workflow, immutable financial history, conservative approval semantics, and required `npm run check` verification.
- Future repository work must follow the current [`AGENTS.md`](../../AGENTS.md) as the authoritative coding-agent instruction set.
