# Task: Slice 4 - Avoided Spend Without Known Amount

Use role: `.agents/roles/orchestrator.md`

## Objective

Implement or verify the flow where the user describes avoided spending without providing a dollar amount.

Victoria should use a known habit amount when available and ask a follow-up question when no estimate exists.

## Required Reading

- `AGENTS.md`
- `.agents/roles/orchestrator.md`
- `docs/agentic-coding-patterns.md`
- `docs/agent-work-queue.md` Slice 4
- `docs/user-stories.md` Story 2
- `docs/decisions.md`
- `tests/test-plan.md`
- Relevant tests under `tests/unit/agent/`
- Relevant source under `src/agent/`

## User Example

```text
I cooked instead of ordering DoorDash.
```

## Expected Behavior

Victoria should:

- Classify the message as `avoided_spend`.
- Look for a known merchant or habit amount.
- Suggest that amount when available.
- Ask a follow-up question when no estimate is available.
- Require approval before recording savings.

## In Scope

- Add or update tests for known habit amount.
- Add or update tests for missing amount fallback.
- Update mock memory/tool behavior if needed.

## Out Of Scope

- Real transaction import.
- Plaid integration.
- Real model integration.
- Persistent memory.
- UI work.

## Likely Test Files

- `tests/unit/agent/victoria-agent.test.ts`
- Future memory/tool tests if needed.

## Likely Source Files

- `src/agent/victoria-agent.ts`
- `src/agent/llm/mock-llm.ts`
- `src/agent/memory/mock-memory.ts`
- `src/agent/tools/mock-tools.ts`

## Suggested Test Cases

- Known DoorDash habit returns a savings suggestion.
- Missing DoorDash habit asks for a typical amount.
- Suggested savings requires approval.
- No ledger entry is created before approval.

## Safety Guardrails

- Do not invent amounts when memory/tooling lacks support.
- Do not create ledger entries before approval.
- Do not imply real money moved or that a mocked ledger entry already exists.

## Silent Failure Risks

- Victoria could silently invent a DoorDash estimate when no habit exists.
- A known habit could be stale or unrelated but still treated as certain.
- The response could omit that the amount is an estimate.
- Tests could cover only the known-habit path and miss the no-estimate fallback.

## Optional Reviewers

- `.agents/roles/test-reviewer.md`
- `.agents/roles/safety-reviewer.md`

## Verification

```bash
npm run check
```

## Done Criteria

- Tests cover known and unknown amount paths.
- Victoria asks a follow-up when no estimate exists.
- Silent-failure risks above are covered by tests, wording, or handoff notes.
- `npm run check` passes.
