# Task: Slice 5 - Regretful Spend Reflection

Use role: `.agents/roles/orchestrator.md`

## Objective

Implement or verify the flow where the user describes spending they regret.

Victoria should respond without shame and should not treat the regretted spending as money saved.

## Required Reading

- `AGENTS.md`
- `.agents/roles/orchestrator.md`
- `docs/agentic-coding-patterns.md`
- `docs/agent-work-queue.md` Slice 5
- `docs/user-stories.md` Story 5
- `docs/decisions.md`
- `tests/test-plan.md`
- Relevant tests under `tests/unit/agent/`
- Relevant source under `src/agent/`

## User Example

```text
I regret ordering takeout last night.
```

## Expected Behavior

Victoria should:

- Classify the message as `regretful_spend`.
- Respond with a nonjudgmental reflection.
- Avoid suggesting savings by default.
- Avoid creating a ledger entry.
- Offer a constructive next step, such as reflection or planning.

## In Scope

- Add or update tests for regretful-spend classification and response.
- Update mock classifier behavior if needed.
- Update response wording if needed.

## Out Of Scope

- Reflection persistence.
- Reminder scheduling.
- Habit insight generation.
- Ledger entry creation by default.
- UI work.

## Likely Test Files

- `tests/unit/agent/victoria-agent.test.ts`

## Likely Source Files

- `src/agent/victoria-agent.ts`
- `src/agent/llm/mock-llm.ts`

## Suggested Test Cases

- The response action is `reflect`.
- The classification is `regretful_spend`.
- No suggestion is returned.
- No tool call is returned.
- The response is nonjudgmental.

## Safety Guardrails

- Do not shame the user.
- Do not treat regretted spending as saved money.
- Do not create a ledger entry by default.
- Do not imply real money moved.
- Do not create a mocked savings suggestion without explicit user intent and approval.

## Silent Failure Risks

- A regretful-spend message could accidentally trigger `suggest_savings`.
- The response could sound supportive but still create a hidden tool call.
- Future reminder or reflection persistence could be added without user intent.
- Tests could miss tone regressions that introduce shame or guilt.

## Optional Reviewers

- `.agents/roles/test-reviewer.md`
- `.agents/roles/safety-reviewer.md`

## Verification

```bash
npm run check
```

## Done Criteria

- Tests cover regretful spend behavior.
- Victoria responds constructively without creating savings.
- Silent-failure risks above are covered by tests, wording, or handoff notes.
- `npm run check` passes.
