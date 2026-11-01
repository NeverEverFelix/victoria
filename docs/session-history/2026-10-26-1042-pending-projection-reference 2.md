# Session: Pending Projection Reference Handling

- Date: 2026-10-26
- Time: 10:42 EDT
- Status: Completed
- Scope: Exercise validated annual fact references through a pending savings workflow and correct 12-month period interpretation.

## Outcome

A validated reference to the selected annual projection can now drive a narrow deterministic response when a monthly savings proposal is pending. Victoria explains that the annual figure is a projection, keeps the existing monthly proposal and its ID intact, and asks for confirmation only for the current-month amount. No ledger entry is created. The regression also revealed and fixed “12-month projection” being interpreted as monthly.

## Work Completed

- Carried a context-validated fact reference from Financial Moment through `classifyWithTeam` to the pending-workflow branch in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added a guard requiring a pending proposal, selected annual horizon, matching annual projection cents and meaning, and an explicit record/log/save/add request before the deterministic explanation runs.
- Updated [planning-reference-resolver.ts](../../src/agent/planning-reference-resolver.ts) so “12-month projection” resolves to annual rather than monthly.
- Added an end-to-end conversation test for a model-resolved “longer projection” reference and the explicit 12-month phrasing; both preserve the pending proposal and create no entry.
- Updated the test plan, work queue, and architecture ADR.

## Decisions

- A model reference may help identify the user’s intended projection, but only deterministic code can map it to the exact pending planning choice.
- Annual projection references do not revise the recordable monthly proposal, create a projection ledger entry, or count as approval.

## Verification

- Focused tests for VictoriaAgent, planning-reference resolver, and specialist prototype — passed: 146 tests.
- `npm run check` — passed: 73 test files passed, 8 skipped; 666 tests passed, 19 skipped, 9 todo.
- `git diff --check` — passed.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` (`_observedThrough` unused); lint reports zero errors.
- Test runs emitted the existing experimental SQLite warning.

## Unresolved

- This path handles a selected annual projection while the current monthly proposal is pending. General conversation workflow persistence and broader reference-based revisions remain open.
- The worktree contains earlier architecture, context-builder, and reference-hint changes; preserve them when continuing.

## Recommended Next Step

- Select one other high-confidence paraphrase for a pending monthly/annual choice and add a regression only if it exposes a gap distinct from this resolved projection reference.
