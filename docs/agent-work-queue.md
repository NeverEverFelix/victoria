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

## Production Multi-Agent Path (Headless, Live Use Disabled)

The product owner has accepted the specialist boundaries in ADR 0001. Develop this path with injected specialists and deterministic tests. Do not connect live model providers or real money movement as part of these slices.

### Slice P1: Stop Safely On Specialist Failure

Status: Implemented in the 2026-10-04 specialist coordination session.

- A specialist exception, timeout, or malformed output returns a clarification outcome.
- Specialists receive an abort signal and the coordinator enforces a bounded call time.
- Do not expose provider error details or run later specialists after a failed prerequisite.
- Keep specialist results advisory and outside financial write authority.

### Slice P2: Hold On Material Specialist Disagreement

Status: Implemented in the 2026-10-04 specialist coordination session.

- A savings recommendation that conflicts with the explicit user-provided amount returns a clarification outcome.
- Do not average the values or silently select either specialist's amount.
- Do not create a proposal or mutation-capable tool call from this outcome.

### Slice P3: Wire The Headless Orchestrator Path

Status: Implemented in the 2026-10-04 orchestration wiring session.

- Adapt the current `VictoriaAgent` to route through injected specialist interfaces while retaining deterministic policy and tool authority.
- Keep app composition mock-backed; do not enable live model calls.
- Add end-to-end agent behavior tests for aligned findings, failures, disagreement, required disclosures, and absence of tool calls on clarification.
- Keep this work headless until the non-UI MVP sequence is complete.

### Slice P4: Add The Companion Voice Handoff

Status: Implemented in the 2026-10-04 companion voice session.

- Pass verified outcome facts and the permitted response goal to an injected voice specialist.
- Keep deterministic wording as the fallback when the voice specialist fails or returns invalid output.
- Preserve required mocked-ledger disclosures outside the specialist's authority.
- Keep live model calls disabled and test both successful and fallback wording paths.

### Slice P5: Define Bounded Specialist Handoff Traces

Status: Implemented in the 2026-10-04 specialist trace session.

- Record role, schema version, correlation ID, outcome status, and timing without hidden reasoning or unnecessary user data.
- Keep traces bounded in memory; durable persistence remains disabled.
- Test that tracing does not become financial authority or change user-visible behavior.

### Slice P6: Review Specialist Runtime Readiness

Status: Reviewed in the 2026-10-04 runtime readiness session. Live use remains blocked.

- Findings are recorded in [`specialist-runtime-readiness.md`](architecture/specialist-runtime-readiness.md).
- Current composition is mock-only; no provider adapter or real transfer path was enabled.
- Cancellation propagation, context minimization, strict versioned schemas, turn/cost budgets, and durable state need follow-up work.

### Slice P7: Propagate Specialist Cancellation

Status: Implemented in the 2026-10-04 specialist cancellation session.

- Add `AbortSignal` support to model adapter and read-only estimation contracts.
- Ensure timed-out calls stop or that late results cannot affect the turn.
- Keep provider configuration and live model use disabled.

### Slice P8: Minimize Model-Facing Context

Status: Implemented in the 2026-10-04 specialist context minimization session.

- Keep user IDs and tool handles in deterministic orchestration/tool context rather than model-facing inputs.
- Pass each role only the message facts and memory needed for that role.
- Add allowlist tests for specialist inputs; keep live model use disabled.

### Slice P9: Define Strict Versioned Handoff Schemas

Status: Implemented in the 2026-10-05 versioned specialist schemas session.

- Add explicit schema versions to specialist input and output handoffs.
- Reject unknown fields and malformed values at every coordinator boundary.
- Keep live model use disabled.

### Next: Add Turn And Cost Budgets

- Define an overall turn deadline and per-role call, token/output, and cost limits.
- Keep live model use disabled by default and retain deterministic fallbacks.
- Test exhaustion, cancellation, and disabled states without live provider calls.

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
- Preserves the event, suggestion, approval, and ledger entry as immutable historical records.
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
- A test proves later memory changes cannot rewrite the approved historical records.
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
- Routes a weekly progress question through a read-only agent tool call.
- Uses Monday 00:00 UTC as the current week's start until user-local timezone support exists.
- Does not imply real money moved.

Likely test area:

- `tests/unit/domain/`
- Future `tests/integration/ledger/`

Likely code area:

- `src/domain/`
- `src/agent/tools/mock-tools.ts`

Done when:

- Domain tests cover weekly total calculation and exclude pending, canceled, and previous-week entries.
- Agent tests cover the read-only tool call, user-scoped total, empty-week response, and mocked-ledger wording.
- `npm run check` passes.

## Slice 8: Goal Allocation

Source story: `docs/user-stories.md` Story 9

Goal:

Victoria should attach a savings goal to a pending or confirmed mocked savings entry when context is clear.

Expected behavior:

- Recognizes a goal-allocation request.
- Uses a pending savings suggestion or a just-confirmed entry in the same conversation when available.
- Asks a follow-up question when context is unclear.
- Does not move real money.
- Records an approved goal allocation as a new immutable record linked to a completed entry.
- Leaves the original savings entry unchanged.

Likely test area:

- `tests/unit/agent/victoria-agent.test.ts`
- Future memory tests.

Likely code area:

- `src/agent/victoria-agent.ts`
- `src/agent/memory/`
- `src/agent/tools/`

Done when:

- Tests cover goal allocation on pending suggestions and confirmed entries, with approval bound to the updated destination.
- Adding a goal to a pending suggestion creates a linked replacement proposal with a fresh approval action.
- A test covers unclear context.
- The confirmed entry remains unchanged and the allocation record is linked to it.
- `npm run check` passes.

Recent-entry context is limited to a confirmed entry in the same conversation. When that context is unavailable, Victoria asks which amount the user means.

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
- Recognizes natural-language transfer requests and does not treat them as approval for a pending mocked entry.

Likely test area:

- `tests/unit/agent/policy.test.ts`
- `tests/unit/agent/victoria-agent.test.ts`
- `tests/unit/config/feature-flags.test.ts`

Likely code area:

- `src/agent/policy.ts`
- `src/agent/victoria-agent.ts`
- `src/config/feature-flags.ts`

Done when:

- Agent tests cover a direct transfer request with and without a pending savings suggestion.
- Neither path creates an entry or requests a real transfer tool.
- Tests prove real transfer tools are blocked in MVP conditions.
- Victoria's message is clear and honest.
- `npm run check` passes.

## Slice 11: Show Weekly Progress After Saving

Source story: `docs/user-stories.md` Story 6

Goal:

After a confirmed entry is recorded, Victoria should show how it changes the user's current-week mocked-ledger total.

Expected behavior:

- Read the completed current-week total after a successful ledger write.
- Clearly describe the amount as recorded in the mocked Victoria ledger.
- If the read-only summary fails, still confirm the successful write and say the total is unavailable.
- A summary failure must not make the user retry the already completed savings action.

Done when:

- Tests cover a successful progress summary and a failed summary lookup after successful recording.
- `npm run check` passes.

## Slice 12: Validate Cents At The Ledger Boundary

Source rule: `docs/specification/mvp-safety-contract.md` rule AMT-001

Goal:

The mocked ledger should reject invalid monetary values even if they bypass conversational amount parsing.

Expected behavior:

- Accept only positive safe integer amounts expressed in USD cents.
- Reject zero, negative, fractional, non-finite, and unsafe integer values before creating an entry.
- Leave the ledger unchanged after rejection.

Done when:

- Contract tests cover invalid amount shapes at the tool boundary.
- `npm run check` passes.

## Backlog Notes

## Slice 10: Honest Recovery From Ledger Write Failure

Source rules: `docs/specification/mvp-safety-contract.md` rules IDM-001, IDM-003, ERR-003, and ERR-004

Goal:

Victoria should keep a confirmed mocked-ledger action safe and retryable when writing fails or the outcome is uncertain.

Expected behavior:

- Never say an entry was recorded when the tool reports an error.
- Tell the user the result could not be confirmed and offer one safe retry step.
- Keep the same approved action pending for retry.
- Make retrying the same user/action identifier idempotent in the mock ledger.

Done when:

- Tests cover failure before persistence and an uncertain outcome after persistence.
- Retrying after either outcome produces at most one mocked ledger entry.
- `npm run check` passes.

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
