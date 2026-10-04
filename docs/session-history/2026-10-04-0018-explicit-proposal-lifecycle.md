# Session: Explicit Proposal Lifecycle

- Date: 2026-10-04
- Time: 00:18 EDT
- Status: Completed
- Scope: Make proposal approval, decline, and replacement transitions explicit and bound to action identity.

## Outcome

Pending savings proposals now carry their action ID. Approval, decline, and supersession pass through one deterministic transition function that verifies the proposal owner and exact action. Each outcome includes an append-only transition record; terminal proposals cannot transition again.

## Work Completed

- Added the deterministic lifecycle function and transition record types in [proposal-lifecycle.ts](../../src/domain/savings/proposal-lifecycle.ts) and [savings/types.ts](../../src/domain/savings/types.ts).
- Wired proposal recording, decline, goal changes, and proposal revisions through that lifecycle in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added tests for valid transitions, mismatched approval identity, terminal-state rejection, supersession, stale actions, and agent transition records in [proposal-lifecycle.test.ts](../../tests/unit/domain/proposal-lifecycle.test.ts) and [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts).
- Updated [the safety contract](../specification/mvp-safety-contract.md), [test plan](../../tests/test-plan.md), [work queue](../agent-work-queue.md), and proposal type contracts.

## Decisions

- Confirmed behavior: a proposal edit or goal change supersedes the old pending proposal and creates a replacement with a new action ID.
- Confirmed behavior: after a decline, a bare later approval does not reopen the old action; Victoria asks the user to restate the event for a new proposal.
- Lifecycle transition records are returned in agent decisions and kept immutable at the type boundary. Durable storage remains out of scope.

## Verification

- `npm run check` passed: setup validation, lint, both typechecks, and tests; 160 tests passed, 13 todo, and 1 test file skipped.
- `git diff --check` passed.
- Lint reports two existing unused-parameter warnings in [mock-memory.ts](../../src/agent/memory/mock-memory.ts).

## Unresolved

- Proposal transition records are currently in-memory response data; process-restart audit history requires a durable storage adapter.
- Remaining contract todo scenarios include persistence, broader transition-table coverage, and audit requirements outside the current proposal flow.

## Recommended Next Step

- Review the remaining executable-contract todos and group the persistence-independent audit and retry cases into the next agent milestone.
