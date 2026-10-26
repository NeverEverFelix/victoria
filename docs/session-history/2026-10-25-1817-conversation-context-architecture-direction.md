# Session: Record conversation context architecture direction

- Date: 2026-10-25
- Time: 18:17 EDT (America/New_York)
- Status: Completed documentation update
- Scope: Record the agreed orchestrator, specialist, context, reference-resolution, and workflow-state direction while preserving the MVP savings boundary.

## Outcome

Victoria's architecture docs now describe explicit context assembly, intent/reference resolution, and structured conversation workflow state as orchestration responsibilities alongside advisory specialists. The current-period-only mocked-ledger boundary is explicit: annualized savings remain conditional projections and cannot be recorded as realized savings.

## Work Completed

- Linked the [conversation architecture review](../VICTORIA_CONVERSATION_CONTEXT_ARCHITECTURE_REVIEW.md) from the [architecture index](../architecture/README.md).
- Recorded responsibilities, current implementation gaps, and the projection boundary in [ADR 0001](../architecture/decisions/0001-orchestrated-multi-agent-architecture.md).
- Added confirmed architecture and annual-projection decisions to [product and technical decisions](../decisions.md).
- Replaced the paused-context-builder note with a staged work-queue entry in [agent-work-queue.md](../agent-work-queue.md).
- No runtime code or tests were changed.

## Decisions

- Confirmed: retain one Victoria orchestrator with advisory Financial Moment, Savings Reasoning, and Companion Voice specialists; add explicit context assembly, reference resolution, and structured workflow state as orchestration responsibilities.
- Confirmed: deterministic validation, exact-action approval, and policy/domain code retain exclusive authority over mocked-ledger writes.
- Confirmed: an annualized amount is planning-only in the current MVP; only the confirmed current-period amount may be recorded.
- Proposals: the review's sample contracts, persistence schema, and rollout phases are not final implementation decisions.

## Verification

- `git diff --check` passed.
- Tests were not run because this was a documentation-only change.
- The worktree already contained unrelated `next-env.d.ts` changes and the untracked architecture review supplied for this discussion; both were preserved.

## Unresolved

- The shape and persistence location for general typed workflow state remain to be designed against existing pending-action repositories.
- Consistent, curated context handoff to Savings Reasoning and broader reference-based pending-action revision remain unimplemented.
- The review's separate projected-goal record remains outside the confirmed MVP boundary.

## Recommended Next Step

- Start with one behavior-focused slice for the gym conversation: trace the existing local flow, specify a typed resolved-period/reference handoff to the active workflow, then add a regression test before implementation. Keep the annual projection planning-only and require fresh confirmation for any revised recordable action.
