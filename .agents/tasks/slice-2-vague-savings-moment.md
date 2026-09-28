# Task: Slice 2 - Vague Savings Moment

Use role: `.agents/roles/orchestrator.md`

## Objective

Implement or verify the flow where the user says they saved money but does not provide enough detail.

Victoria should ask a follow-up question and avoid guessing an amount, merchant, or savings action.

## Required Reading

- `AGENTS.md`
- `.agents/roles/orchestrator.md`
- `docs/agentic-coding-patterns.md`
- `docs/agent-work-queue.md` Slice 2
- `docs/user-stories.md` Story 4
- `docs/decisions.md`
- `tests/test-plan.md`
- Relevant tests under `tests/unit/agent/`
- Relevant source under `src/agent/`

## User Example

```text
I saved money today.
```

## Expected Behavior

Victoria should:

- Classify the message as `unclear`.
- Ask what the user avoided or changed.
- Avoid inventing a merchant or amount.
- Avoid creating a savings suggestion.
- Avoid requesting any tool call.
- Avoid creating a ledger entry.

## In Scope

- Add or update unit tests for the vague message flow.
- Update mock classifier behavior if needed.
- Update agent follow-up wording if needed.

## Out Of Scope

- Memory persistence.
- Real model integration.
- Ledger entry creation.
- Goal allocation.
- UI work.

## Likely Test Files

- `tests/unit/agent/victoria-agent.test.ts`

## Likely Source Files

- `src/agent/victoria-agent.ts`
- `src/agent/llm/mock-llm.ts`

## Suggested Test Cases

- The response action is `ask_follow_up`.
- The classification is `unclear`.
- No suggestion is returned.
- No tool call is returned.
- The message asks for clarifying context.

## Safety Guardrails

- Do not treat vague savings language as approval.
- Do not estimate an amount without context.
- Do not create a ledger entry.
- Do not imply real money moved or that a mocked savings action occurred.

## Silent Failure Risks

- Victoria could ask a follow-up but still attach a hidden tool call.
- A future classifier could map vague savings language to `avoided_spend`.
- The response could pressure the user to invent an amount.
- Tests could pass while only checking the message text, not the absence of suggestion/tool call.

## Optional Reviewers

- `.agents/roles/test-reviewer.md`
- `.agents/roles/safety-reviewer.md`

## Verification

```bash
npm run check
```

## Done Criteria

- Tests cover the vague savings moment.
- Victoria asks a follow-up question.
- No suggestion, tool call, or ledger entry is created.
- Silent-failure risks above are covered by tests, wording, or handoff notes.
- `npm run check` passes.
