# Agent Work Queue

This file gives coding agents a prioritized list of small implementation slices.

Agents should work from the top unless the user explicitly chooses a different item. Each slice should be completed with tests and verified with `npm run check`.

## Working Rules

- Read `AGENTS.md` before starting.
- Read the linked user story before coding.
- Prefer one slice per change.
- Write or update tests before implementation when practical.
- Keep mocked ledger behavior separate from real money movement.
- Do not add real OpenAI, Plaid, Prisma, or banking transfer integrations unless the slice explicitly asks for it.
- Update docs when behavior changes.

## Slice 1: Avoided Spend With Explicit Amount

Source story: `docs/user-stories.md` Story 1

Goal:

Victoria should recognize an avoided-spend message with a clear dollar amount and suggest recording that amount as saved.

Example:

```text
I almost bought a $90 jacket but decided to wait.
```

Expected behavior:

- Classifies the message as `avoided_spend`.
- Uses the user-provided amount.
- Creates a savings suggestion for 9000 cents.
- Requires approval before creating a ledger entry.
- Does not claim real money moved.

Likely test area:

- `tests/unit/agent/victoria-agent.test.ts`

Likely code area:

- `src/agent/victoria-agent.ts`
- `src/agent/llm/mock-llm.ts`
- `src/agent/tools/mock-tools.ts`

Done when:

- A test covers the explicit amount flow.
- The response includes a savings suggestion.
- No ledger entry is created before approval.
- `npm run check` passes.

## Slice 2: Vague Savings Moment

Source story: `docs/user-stories.md` Story 4

Goal:

Victoria should ask a follow-up question when the user says they saved money but does not provide enough detail.

Example:

```text
I saved money today.
```

Expected behavior:

- Classifies the message as `unclear`.
- Asks what the user avoided or changed.
- Does not guess a merchant or amount.
- Does not create a savings suggestion.
- Does not create a ledger entry.

Likely test area:

- `tests/unit/agent/victoria-agent.test.ts`

Likely code area:

- `src/agent/victoria-agent.ts`
- `src/agent/llm/mock-llm.ts`

Done when:

- A test covers the vague message flow.
- Victoria asks a follow-up question.
- No tool call is requested.
- `npm run check` passes.

## Slice 3: Confirm Suggested Savings

Source story: `docs/user-stories.md` Story 6

Goal:

Victoria should create a mocked ledger entry only after the user confirms a pending savings suggestion.

Example:

```text
Victoria:
Want to record $27 as saved?

User:
Yes.
```

Expected behavior:

- Requires an existing pending savings suggestion.
- Recognizes approval through the approval path.
- Creates a mocked ledger entry.
- Includes amount, reason, movement mode, and approval context.
- Communicates that the amount was recorded in the Victoria ledger.

Likely test area:

- `tests/unit/agent/victoria-agent.test.ts`
- `tests/unit/agent/policy.test.ts`

Likely code area:

- `src/agent/victoria-agent.ts`
- `src/agent/policy.ts`
- `src/agent/tools/mock-tools.ts`

Done when:

- A test proves approval creates a ledger entry.
- A test proves no pending suggestion means no entry is created.
- Mocked ledger entries remain separate from real money movement.
- `npm run check` passes.

## Slice 4: Avoided Spend Without Known Amount

Source story: `docs/user-stories.md` Story 2

Goal:

Victoria should handle avoided-spend messages that do not include a dollar amount.

Example:

```text
I cooked instead of ordering DoorDash.
```

Expected behavior:

- Classifies the message as `avoided_spend`.
- Looks for a known merchant or habit amount.
- Suggests that amount when available.
- Asks a follow-up question when no estimate is available.
- Requires approval before recording savings.

Likely test area:

- `tests/unit/agent/victoria-agent.test.ts`
- Future memory/tool tests if needed.

Likely code area:

- `src/agent/victoria-agent.ts`
- `src/agent/llm/mock-llm.ts`
- `src/agent/memory/mock-memory.ts`
- `src/agent/tools/mock-tools.ts`

Done when:

- A test covers known habit amount.
- A test covers missing amount fallback.
- No ledger entry is created before approval.
- `npm run check` passes.

## Slice 5: Regretful Spend Reflection

Source story: `docs/user-stories.md` Story 5

Goal:

Victoria should respond to regretful spending without shame and without treating the spend as savings.

Example:

```text
I regret ordering takeout last night.
```

Expected behavior:

- Classifies the message as `regretful_spend`.
- Responds with a nonjudgmental reflection.
- Does not suggest recording savings by default.
- Does not create a ledger entry.

Likely test area:

- `tests/unit/agent/victoria-agent.test.ts`

Likely code area:

- `src/agent/victoria-agent.ts`
- `src/agent/llm/mock-llm.ts`

Done when:

- A test covers regretful spend.
- The response is nonjudgmental.
- No savings suggestion or ledger entry is created.
- `npm run check` passes.

## Slice 6: Decline Suggested Savings

Source story: `docs/user-stories.md` Story 7

Goal:

Victoria should let the user decline a pending savings suggestion without pressure.

Expected behavior:

- Recognizes a decline for a pending suggestion.
- Does not create a ledger entry.
- Returns a lightweight response.
- Does not pressure the user.

Likely test area:

- `tests/unit/agent/victoria-agent.test.ts`

Likely code area:

- `src/agent/victoria-agent.ts`
- `src/agent/policy.ts`

Done when:

- A test proves decline does not create a ledger entry.
- Victoria responds respectfully.
- `npm run check` passes.

## Slice 7: Weekly Mocked Savings Progress

Source story: `docs/user-stories.md` Story 8

Goal:

Victoria should summarize confirmed mocked ledger entries for the current week.

Expected behavior:

- Sums confirmed mocked ledger entries for the current week.
- Excludes pending, declined, canceled, or previous-week entries.
- Formats the total clearly.
- Does not imply real money moved.

Likely test area:

- `tests/unit/domain/`
- Future `tests/integration/ledger/`

Likely code area:

- `src/domain/`
- `src/agent/tools/mock-tools.ts`

Done when:

- Domain tests cover weekly total calculation.
- Agent or tool tests cover summary behavior if implemented.
- `npm run check` passes.

## Slice 8: Goal Allocation

Source story: `docs/user-stories.md` Story 9

Goal:

Victoria should attach a savings goal to a pending or confirmed mocked savings entry when context is clear.

Expected behavior:

- Recognizes a goal-allocation request.
- Uses pending or recent savings context when available.
- Asks a follow-up question when context is unclear.
- Does not move real money.

Likely test area:

- `tests/unit/agent/victoria-agent.test.ts`
- Future memory tests.

Likely code area:

- `src/agent/victoria-agent.ts`
- `src/agent/memory/`
- `src/agent/tools/`

Done when:

- A test covers goal allocation with clear context.
- A test covers unclear context.
- Mocked ledger status remains explicit.
- `npm run check` passes.

## Slice 9: No Real Money Movement Boundary

Source story: `docs/user-stories.md` Story 10

Goal:

Victoria should clearly refuse or redirect real money movement requests in the MVP.

Example:

```text
Move the money now.
```

Expected behavior:

- Explains that the MVP can only record savings.
- Does not call `eventuallyMoveMoney`.
- Offers mocked ledger recording if appropriate.
- Preserves a clear boundary between mocked and real movement.

Likely test area:

- `tests/unit/agent/policy.test.ts`
- `tests/unit/agent/victoria-agent.test.ts`
- `tests/unit/config/feature-flags.test.ts`

Likely code area:

- `src/agent/policy.ts`
- `src/agent/victoria-agent.ts`
- `src/config/feature-flags.ts`

Done when:

- Tests prove real transfer tools are blocked in MVP conditions.
- Victoria's message is clear and honest.
- `npm run check` passes.

## Backlog Notes

These are useful later, but should wait until the core loop works:

- OpenAI-backed classification adapter.
- Prisma/Postgres persistence.
- Plaid sandbox transaction reads.
- Notification reminders.
- Production deployment.

## Final Phase: Victoria UI

Do not begin this phase until every non-UI MVP slice above is complete and `npm run check` passes.

This phase may include:

- The browser-based Victoria conversation experience.
- Mocked savings ledger and progress views.
- Shared UI components and the Victoria design system.
- Responsive and accessible interaction states.
- End-to-end browser journeys.

Do not create a temporary testing UI before this phase. Exercise unfinished behavior through headless tests instead.
