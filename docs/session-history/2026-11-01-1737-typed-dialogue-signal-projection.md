# Session: Typed Dialogue Signal Projection

- Date: 2026-11-01
- Time: 17:37 America/New_York
- Status: Partial
- Scope: Continue F-04 by projecting advisory dialogue signal tags and immutable source-turn IDs into the read-only conversation snapshot.

## Outcome

Historical user turns now carry a deterministic rough signal tag (question, constraint, correction, decision, or topic) through to the read-only responder context. Tags remain fallible continuity hints; they do not resolve questions, supersede earlier turns, establish truth, or authorize actions.

## Work Completed

- Added coverage for the five signal tags and verified source IDs and original source text remain unchanged in [`src/agent/dialogue-working-state.ts`](../../src/agent/dialogue-working-state.ts) and [`tests/unit/agent/dialogue-working-state.test.ts`](../../tests/unit/agent/dialogue-working-state.test.ts).
- Projected source turn ID and signal kind into `priorDialogue` in [`src/agent/conversation-responder.ts`](../../src/agent/conversation-responder.ts) and covered the snapshot contract in [`tests/unit/agent/conversation-responder.test.ts`](../../tests/unit/agent/conversation-responder.test.ts).
- Updated the product, story, test, safety, and review status docs: [`docs/mvp.md`](../mvp.md), [`docs/user-stories.md`](../user-stories.md), [`tests/test-plan.md`](../../tests/test-plan.md), [`docs/specification/mvp-safety-contract.md`](../specification/mvp-safety-contract.md), and [`docs/architecture/conversation-architecture-review-2026-11-01-follow-up.md`](../architecture/conversation-architecture-review-2026-11-01-follow-up.md).

## Decisions

- Signal tags are heuristic labels only. Explicit later user corrections can guide a read-only response, but the projection itself does not mutate or suppress prior turns.
- F-04 remains partial because unresolved-question and constraint lifecycle, plus richer topic resolution, have not been implemented.
- No cross-session financial retrieval or change to financial evidence/approval boundaries was introduced.

## Verification

- Focused dialogue-state, responder, and PostgreSQL persistence tests: 48 passed.
- `npm run check`: passed agent validation, lint, source and test type checks, and full suite (127 files passed, 9 skipped; 1,125 tests passed, 29 skipped, 9 todo).
- `git diff --check HEAD`: passed.
- Local and Supabase dialogue-state migrations remain identical.
- Existing Node SQLite experimental warnings remain.

## Unresolved

- F-01 remains partial; whole-turn composition still spans services.
- F-03 and F-06 need broader held-out and human evaluation.
- F-04 still needs structured open-question/constraint lifecycle and richer topic resolution.
- F-05 cross-session financial-history retrieval remains open.
- F-07 needs blinded human quality review before deciding specialist routing.
- F-08 remains deferred by the mock-ledger MVP boundary.
- F-10 requires the repository owner to replace the invalid Actions API secret and rerun the review job.
- The worktree contains other repository changes and staged deletions of duplicate ` 2` snapshots; preserve those unrelated changes.

## Recommended Next Step

Inspect F-01's remaining workflow outcome/composition seam and identify one small deterministic boundary that can be unified without changing financial approval behavior.
