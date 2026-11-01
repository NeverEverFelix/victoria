# Session: Model-interpreted safe fallback

- Date: 2026-10-30
- Time: 20:25 EDT
- Status: Partial
- Scope: Use successful full-turn advisory interpretation to improve read-only fallback recovery when conversational response generation fails.

## Outcome

The canonical conversation snapshot now records whether its advisory turn plan came from the model or deterministic fallback. When response generation fails after a successful model interpretation, read-only topic switches and financial reflections can select neutral recovery wording from the model's validated intent labels. The fallback does not rely on model action attempts or uncertain plans, and it does not authorize or perform financial actions.

## Work Completed

- Added `turnUnderstandingSource` to [`ConversationContextSnapshot`](../../src/agent/conversation-responder.ts) and propagated it from the orchestrator, read-only reply service, and pending-history response service.
- Updated [`conversation-fallback.ts`](../../src/agent/conversation-fallback.ts) to use model-sourced, unambiguous, no-action dialogue/reflection labels for neutral fallback selection. Existing deterministic pending workflow metadata continues to supply status wording.
- Added regressions for a model-interpreted topic switch without matching semantic keywords, a financial-reflection paraphrase, and an advisory approval attempt that must not authorize completion wording. Added an agent test proving model provenance reaches the responder.
- Updated [`tests/test-plan.md`](../../tests/test-plan.md) and the F05 row in the [architecture review crosswalk](../architecture/conversation-architecture-spec-follow-up-2026-10-29.md).

## Decisions

- Turn interpretation remains advisory. Fallback selection accepts only a model-sourced plan with `requestedAction: none` and no clarification uncertainty; approval attempts and unclear requests cannot activate the new neutral branch.
- User/workflow scope, pending status, and all financial decisions continue to come from deterministic application context and policy.
- This is a degraded-mode wording improvement, not evidence of provider naturalness or relevance quality.

## Verification

- Focused fallback and turn-reply tests — passed, 24/24.
- `npm run check` — passed: agent validation, lint, source/test type checks, 121 test files passed, 1,093 tests passed, 29 skipped, and 9 todo.
- `git diff --check` — passed.
- Existing Node SQLite experimental-feature warnings appeared during the test run.

## Unresolved

- F04 remains partial; `VictoriaAgent` still requires additional seam-by-seam parity work.
- F05 has other bounded deterministic fallback cases and needs blinded human quality review.
- Post-optimization live provider measurements, human memory relevance scoring, and hosted PostgreSQL outage/multi-worker parity remain open external verification gates.
- The worktree contains a large uncommitted set of earlier architecture-review changes; this entry records only this slice.

## Recommended Next Step

Continue auditing remaining implementation-level F01/F02/F04/F05 items against the current code and acceptance cases. Keep provider-quality, product-target, and hosted-operation evidence labeled as outstanding until it is produced and reviewed.
