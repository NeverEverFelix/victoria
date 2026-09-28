# Victoria Agentic Coding Kit

This directory contains reusable role prompts and templates for agentic coding on Victoria.

These files do not automatically run agents. They define the operating setup for a human or coding agent to launch an orchestrator/reviewer workflow consistently.

## Roles

- `roles/orchestrator.md`: default coding agent role for implementation tasks.
- `roles/test-reviewer.md`: checks test coverage and behavior assertions.
- `roles/safety-reviewer.md`: checks money movement, approval, environment, and trust boundaries.
- `roles/architecture-reviewer.md`: checks module boundaries and adapter/interface usage.
- `roles/docs-reviewer.md`: checks whether docs match behavior.

## Templates

- `templates/task-brief.md`: use before starting a coding slice.
- `templates/reviewer-brief.md`: use when delegating a narrow review.
- `templates/handoff.md`: use after completing a coding slice.

## Tasks

- `tasks/slice-1-avoided-spend-explicit-amount.md`: first launch-ready implementation task.
- `tasks/slice-2-vague-savings-moment.md`: unclear savings message follow-up.
- `tasks/slice-3-confirm-suggested-savings.md`: approval flow for mocked ledger entries.
- `tasks/slice-4-avoided-spend-without-known-amount.md`: known habit estimate or follow-up.
- `tasks/slice-5-regretful-spend-reflection.md`: nonjudgmental regretful-spend response.

## Recommended Workflow

1. Start with `roles/orchestrator.md`.
2. Pick a launch-ready task from `tasks/`, or fill out `templates/task-brief.md`.
3. Implement one slice from `docs/agent-work-queue.md`.
4. Use reviewer roles only when the task is risky or cross-cutting.
5. Finish with `templates/handoff.md`.

Default rule: one orchestrator agent is enough for most tasks.
