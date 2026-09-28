# Task: Slice 1 - Avoided Spend With Explicit Amount

Use role: `.agents/roles/orchestrator.md`

This task is the first launch-ready coding slice for Victoria.

## Objective

Implement or verify the avoided-spend flow where the user provides a clear dollar amount.

Victoria should recognize the avoided purchase, use the provided amount, suggest recording it as saved, and require approval before creating any mocked ledger entry.

## Required Reading

Read these before coding:

- `AGENTS.md`
- `.agents/roles/orchestrator.md`
- `docs/agentic-coding-patterns.md`
- `docs/agent-work-queue.md`
- `docs/user-stories.md` Story 1
- `docs/decisions.md`
- `tests/test-plan.md`
- Relevant existing tests under `tests/unit/agent/`
- Relevant source under `src/agent/`

## Source References

Work queue:

- `docs/agent-work-queue.md` Slice 1

User story:

- `docs/user-stories.md` Story 1: Avoided Spend With User-Provided Amount

Decisions:

- MVP uses a mocked savings ledger.
- Confirmation is required before recording savings.
- Real money movement is out of scope for MVP.

## User Example

```text
I almost bought a $90 jacket but decided to wait.
```

## Expected Behavior

Victoria should:

- Classify the message as `avoided_spend`.
- Detect or preserve the user-provided amount of $90.
- Create a savings suggestion for 9000 cents.
- Set the suggestion source to `user_provided`.
- Require approval before creating a ledger entry.
- Avoid calling `createSavingsEntry` during the initial response.
- Avoid claiming that real money moved.

## In Scope

- Add or update unit tests for this exact flow.
- Update mock classifier behavior if needed.
- Update mock tool behavior if needed.
- Update agent orchestration only as needed for this behavior.
- Keep the response aligned with Victoria's tone and safety rules.

## Out Of Scope

- Real OpenAI integration.
- Real Plaid integration.
- Prisma or database persistence.
- Real money movement.
- UI work.
- Weekly summaries.
- Goal allocation.
- Broad refactors.
- New abstractions not needed for this slice.

## Likely Test Files

- `tests/unit/agent/victoria-agent.test.ts`

May also inspect:

- `tests/unit/agent/policy.test.ts`
- `tests/unit/domain/money.test.ts`

## Likely Source Files

- `src/agent/victoria-agent.ts`
- `src/agent/llm/mock-llm.ts`
- `src/agent/tools/mock-tools.ts`
- `src/agent/types.ts`

## Suggested Test Cases

Add or confirm coverage for:

- Given the user says `I almost bought a $90 jacket but decided to wait`, Victoria returns a `suggest_savings` decision.
- The returned classification is `avoided_spend`.
- The returned suggestion amount is `9000`.
- The returned suggestion source is `user_provided`.
- The returned tool call is `createSavingsEntry`.
- The returned tool call requires approval.
- No ledger entry is created before approval.
- The user-facing message does not imply a real transfer.

## Safety Guardrails

- Do not add or enable real transfers.
- Do not call `eventuallyMoveMoney`.
- Do not claim funds were moved.
- Do not treat the initial avoided-spend message as approval.
- Do not create a ledger entry until an explicit approval path is used.

## Optional Reviewers

Use reviewers only if the change is larger than expected or touches multiple boundaries.

Recommended reviewer roles:

- `.agents/roles/test-reviewer.md` if tests are added or changed substantially.
- `.agents/roles/safety-reviewer.md` if approval, tool calls, or money movement behavior changes.
- `.agents/roles/architecture-reviewer.md` if new interfaces or module boundaries are introduced.

Reviewer prompt template:

- `.agents/templates/reviewer-brief.md`

## Verification

Run:

```bash
npm run check
```

The task is not complete until the check passes or the handoff clearly explains why it could not be run.

## Done Criteria

This task is done when:

- Tests cover the explicit amount avoided-spend flow.
- Victoria suggests saving 9000 cents for the $90 example.
- The savings entry is pending approval, not created immediately.
- The behavior remains mocked-ledger only.
- `npm run check` passes.
- The final response uses `.agents/templates/handoff.md`.

## Handoff

Use `.agents/templates/handoff.md`.

Include:

- Tests added or updated.
- Source files changed.
- Verification result.
- Any follow-up work.
- Any product question that came up and was not resolved.
