# Session: Episodic Workflow Provenance

- Date: 2026-10-27
- Time: 13:37 EDT
- Status: Partial
- Scope: Continue the conversational-core deep-dive by separating user-grounded episodic summaries from authoritative mocked-ledger outcomes.

## Outcome

Episodic summary prose and evidence remain based on exact user-authored quotes. A separate typed metadata field can now retain a completed mocked-ledger outcome only when projected from a completed `SavingsEntry` returned by the domain tool. Assistant transcript text and model-supplied outcome claims are not used as persistence evidence.

## Work Completed

- Added `AuthoritativeEpisodeOutcome` and `authoritativeEpisodeOutcome()` in [episodic-summary.ts](../../src/agent/memory/episodic-summary.ts), validating completed status, mock-ledger mode, USD currency, positive cents, and stable identifiers.
- Passed the current conversation's recent domain-tool entry into episode validation on overflow and explicit finish. User summaries stay in `value`; workflow outcomes are stored separately in source metadata.
- Added tests covering valid completed entries, pending and real-transfer rejection, and ignoring model-supplied workflow claims.
- Updated [mvp.md](../mvp.md) and [test-plan.md](../test-plan.md) with the provenance boundary.

## Decisions

- Confirmed implementation choice: the summarizer cannot generate workflow outcomes. Only the agent's validated projection of a completed mocked-ledger domain result may populate the typed outcome metadata.
- No change to savings approval, ledger, or memory retrieval behavior.

## Verification

- Focused episodic tests: 8 passed; test type-check passed.
- `npm run check` passed: 81 test files passed, 9 skipped; 735 tests passed, 23 skipped, 9 todo.
- `git diff --check` passed.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted experimental SQLite warnings.

## Unresolved

- The recent-entry source is in-process and holds only the latest completed entry per conversation. Durable cross-restart linkage to all immutable ledger events and transcript turn IDs remains open.
- Transitive forgetting/retention for facts embedded in episodes, memory telemetry, broader orchestration refactoring, and provider-backed multi-turn evaluation remain open findings.
- The worktree contains pre-existing user changes and untracked files; none were reset or overwritten.

## Recommended Next Step

Add durable, user-scoped event and turn provenance to episodic records, then verify correction and forget suppression across every episodic retrieval surface.
