# Agentic Coding Patterns

This document defines how coding agents should work on Victoria.

It is about the development workflow, not Victoria's runtime agent architecture.

## Default Pattern: One Orchestrator Agent

Most tasks should be handled by one coding agent acting as the orchestrator.

The orchestrator owns the work end to end:

1. Read the required context.
2. Pick or confirm one work slice.
3. Write or update tests.
4. Implement the smallest useful change.
5. Run verification.
6. Check whether docs need updates.
7. Summarize the result clearly.

The orchestrator should stay focused on the requested task. Do not bundle unrelated cleanup, refactors, integrations, or product changes into the same slice.

## Required Context

Before coding, the orchestrator should read:

- `AGENTS.md`
- `docs/agent-work-queue.md`
- The relevant story in `docs/user-stories.md`
- The relevant decisions in `docs/decisions.md`
- The relevant tests and source files

For larger behavior changes, also read:

- `docs/mvp.md`
- `tests/test-plan.md`
- `docs/environments.md` when config, secrets, providers, or money movement are involved

## Work Slice Pattern

Every coding task should follow this shape:

```text
Context
  -> read docs, tests, and source

Scope
  -> choose one slice or one explicit user request

Tests
  -> add or update behavior-focused tests

Implementation
  -> make the smallest change that satisfies the behavior

Verification
  -> run npm run check

Review
  -> check safety, docs, and architecture boundaries

Handoff
  -> summarize changes, tests, and follow-ups
```

This pattern matters because Victoria touches money-related behavior. Small verified slices are safer than broad implementation passes.

## Specialist Reviewer Pattern

Specialist subagents may be useful for review, but they should not make product decisions or edit overlapping files without coordination.

Use specialist reviewers when a task is risky, cross-cutting, or easy to get subtly wrong.

Good reviewer roles:

- Test reviewer: checks whether tests cover the promised behavior.
- Safety reviewer: checks approval, mocked ledger, real money movement, and environment boundaries.
- Architecture reviewer: checks whether changes respect existing interfaces and module boundaries.
- Docs reviewer: checks whether changed behavior requires documentation updates.

Avoid specialist reviewers for small single-file changes unless the user asks for review.

## Specialist Reviewer Prompt Shape

When asking a reviewer to inspect work, give them a narrow brief:

```text
Review this change for [specific concern].

Context:
- Product boundary:
- Files changed:
- Behavior expected:

Please report:
- Blocking issues
- Non-blocking concerns
- Missing tests
- Docs drift
```

The orchestrator decides what to do with the review findings and makes any final edits.

## Handoff Pattern

Every completed coding task should leave a clear handoff.

Use this shape:

```text
Completed:
- What changed

Verified:
- npm run check

Notes:
- Decisions made
- Follow-up work
- Anything not run or not completed
```

The handoff should be short, specific, and useful to the next agent or human.

## Guardrails

Coding agents must treat these as hard constraints:

- Do not move real money.
- Do not claim mocked ledger entries are bank transfers.
- Do not add production Plaid behavior without explicit scope.
- Do not add real transfer behavior without explicit scope.
- Do not treat ambiguous user language as approval.
- Do not skip tests for agent behavior.
- Do not change product behavior without checking docs.
- Do not let a subagent invent unresolved product decisions.
- Do not expand a work slice just because adjacent code is nearby.

When a task hits an unresolved product question, check `docs/decisions.md`. If the answer is not there, ask the user or record the question instead of guessing.

## File Ownership Pattern

Use files according to their role:

- Product scope belongs in `docs/mvp.md`.
- Product decisions belong in `docs/decisions.md`.
- User-facing behavior belongs in `docs/user-stories.md`.
- Implementation order belongs in `docs/agent-work-queue.md`.
- Agent coding workflow belongs in this file.
- Test strategy belongs in `tests/test-plan.md` and `tests/README.md`.
- Runtime code belongs in `src/`.

Avoid duplicating large sections between docs. Link or reference the source of truth instead.

## When To Update Docs

Update docs in the same task when code changes:

- MVP scope.
- User-visible behavior.
- Safety boundaries.
- Environment assumptions.
- Implementation priority.
- Agent workflow.

Do not update docs for purely internal refactors unless the change affects how future agents should work.

## When To Ask The User

Ask the user before:

- Expanding the MVP scope.
- Adding real external integrations.
- Changing money movement behavior.
- Introducing a new persistence layer.
- Changing the first-user assumption.
- Choosing between unresolved product options in `docs/decisions.md`.

Do not ask for routine implementation choices when the existing docs and code patterns are enough to proceed.

## Recommended Agentic Coding Setup

For Victoria's current stage, use:

- One orchestrator agent by default.
- Specialist reviewers only for risky or cross-cutting changes.
- `docs/agent-work-queue.md` as the source for next coding slices.
- `docs/decisions.md` as the source for product decisions and open questions.
- `npm run check` as the standard verification gate.

This keeps the workflow agent-friendly without creating unnecessary process overhead.
