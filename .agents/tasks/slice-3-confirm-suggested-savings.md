# Task: Slice 3 - Confirm Suggested Savings

Use role: `.agents/roles/orchestrator.md`

## Objective

Implement or verify the approval flow where Victoria creates a mocked ledger entry only after the user confirms a pending savings suggestion.

## Required Reading

- `AGENTS.md`
- `.agents/roles/orchestrator.md`
- `docs/agentic-coding-patterns.md`
- `docs/agent-work-queue.md` Slice 3
- `docs/user-stories.md` Story 6
- `docs/decisions.md`
- `tests/test-plan.md`
- `tests/unit/agent/victoria-agent.test.ts`
- `tests/unit/agent/policy.test.ts`
- Relevant source under `src/agent/`

## Example Flow

```text
Victoria:
Want to record $27 as saved?

User:
Yes.
```

## Expected Behavior

Victoria should:

- Require an existing pending savings suggestion.
- Require approval that matches the exact pending action and user.
- Create a mocked ledger entry after approval.
- Include amount, reason, movement mode, and approval context.
- Avoid creating an entry when no pending suggestion exists.
- Consume the pending action so approval cannot be replayed.
- Avoid claiming real money moved.

## In Scope

- Add or update tests for approval creating a mocked ledger entry.
- Add or update tests for approval without a pending suggestion.
- Update policy or agent approval handling only as needed.

## Out Of Scope

- Natural-language yes/no parsing outside the approval path.
- Real money movement.
- Persistent database storage.
- UI work.

## Likely Test Files

- `tests/unit/agent/victoria-agent.test.ts`
- `tests/unit/agent/policy.test.ts`

## Likely Source Files

- `src/agent/victoria-agent.ts`
- `src/agent/policy.ts`
- `src/agent/tools/mock-tools.ts`

## Suggested Test Cases

- Approving a pending suggestion creates a mocked ledger entry.
- Approving without a tool call returns a refusal or no-action response.
- Approval for another action or user is refused.
- Replaying approval for a completed action is refused.
- The created entry uses `mock_ledger`.
- The user-facing message does not imply a bank transfer.

## Safety Guardrails

- Do not bypass policy.
- Do not call `eventuallyMoveMoney`.
- Do not create entries without a pending approved action.
- Do not describe mocked savings as transferred funds.

## Silent Failure Risks

- Approval handling could accept a confirmation without a matching pending suggestion.
- A mocked ledger entry could be worded as a completed bank movement.
- Policy tests could pass while the agent calls tools directly elsewhere.
- A future real-transfer mode could reuse mocked approval behavior without stronger checks.

## Optional Reviewers

- `.agents/roles/test-reviewer.md`
- `.agents/roles/safety-reviewer.md`
- `.agents/roles/architecture-reviewer.md` if approval boundaries change.

## Verification

```bash
npm run check
```

## Done Criteria

- Tests cover approval and no-pending-suggestion behavior.
- Mocked ledger entry creation happens only after approval.
- Silent-failure risks above are covered by tests, wording, or handoff notes.
- `npm run check` passes.
