# Session: Review specialist runtime readiness

- Date: 2026-10-04
- Time: 16:45 America/New_York
- Status: Completed; review findings documented
- Scope: Audit the headless specialist path for blockers before any live model provider adapter is considered.

## Outcome

The specialist runtime is not ready for live providers. Current app composition remains mock-only and real money movement remains blocked. Documented cancellation propagation, data minimization, strict handoff schemas, turn/cost budgets, and durable state as required follow-up boundaries.

## Work Completed

- Added [specialist-runtime-readiness.md](../architecture/specialist-runtime-readiness.md) with confirmed safeguards, readiness gaps, and a proposed implementation order.
- Linked the review from [architecture/README.md](../architecture/README.md) and updated [agent-work-queue.md](../agent-work-queue.md): the next code slice is cancellation propagation through model and read-only tool contracts.
- No runtime code or live provider configuration was changed. The worktree still contains the preceding uncommitted multi-agent specialist implementation and documentation changes from this task sequence.

## Decisions

- Confirmed: app composition requires `OPENAI_MODEL=mock` while no live adapter exists; non-mock requests fail clearly.
- Confirmed: specialist timeouts currently do not propagate to `LlmAdapter` or `estimateAvoidedSpend` dependencies because those interfaces have no abort-signal parameter.
- Confirmed: specialist inputs currently include broad memory/source context and an orchestration user ID; provider-facing inputs need narrower separation.
- Confirmed: turn-wide provider cost/time budgets, strict versioned output schemas, and durable state/traces are not implemented.
- Confirmed: this review does not authorize live provider use. Real money movement remains outside the path and unavailable in the MVP.
- Proposed next work: implement cancellation propagation, then context minimization and strict schema validation before considering provider settings or live gates.

## Verification

- `npm run agent:validate` — passed.
- `git diff --check` — passed.
- Full test suite not run; this review changed documentation only.

## Unresolved

- Process-local pending proposal state and trace buffers do not survive restarts or coordinate across instances.
- No live provider, role-specific model configuration, total call/cost budget, or durable trace storage exists.

## Recommended Next Step

Implement abort-signal propagation from the orchestrator through LLM and read-only savings-estimation interfaces. Prove timeout cancellation and safe handling of late results while all app composition remains mock-backed.
