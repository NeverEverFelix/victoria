# Session: Local Semantic Memory And Relevance Evaluation

- Date: 2026-10-22
- Time: 19:52 America/New_York
- Status: Partial
- Scope: Enable semantic embeddings in local persistent chat and add a labeled relevance evaluation for the provisional recall threshold.

## Outcome

Local persistent memory now injects the existing 1536-dimensional OpenAI embedding adapter when a real non-placeholder API key is configured. Added a synthetic relevance set and `npm run eval:memory:relevance`, which reports precision/recall over candidate thresholds for the configured embedding model. The 0.76 value remains provisional because no live, potentially billable provider evaluation was run in this session.

## Work Completed

- Wired the optional OpenAI embedding provider into [local persistent runtime](../../src/app/http/create-local-mock-victoria-runtime.ts); no-key/placeholder mode retains recent-memory fallback.
- Added the synthetic relevance cases in [memory-relevance-cases.json](../../tests/evaluation/memory-relevance-cases.json) and the live evaluation command in [evaluate-memory-relevance.mjs](../../scripts/evaluate-memory-relevance.mjs).
- Added `OPENAI_EMBEDDING_MODEL` to the environment example and documented local provider data flow and evaluation in [environments](../environments.md), [user-learning schema](../specification/user-learning-schema.md), [agent work queue](../agent-work-queue.md), and [test plan](../../tests/test-plan.md).

## Decisions

- Confirmed by existing product policy: semantic scores broaden topic recall but do not bypass freshness, user scoping, evidence validation, or concrete-use cues.
- 0.76 remains a provisional threshold until evaluation results are reviewed. No threshold change was made based on synthetic labels alone.

## Verification

- `npm run check` passed agent validation and lint, then failed source typecheck because generated `.next/types/cache-life.d 2.ts` and `.next/types/routes.d 2.ts` contain duplicate definitions. These workspace artifacts were left untouched.
- `npm run typecheck:test` passed.
- `npm test` passed: 535 tests passed, 15 skipped, 9 todo; 7 files skipped.
- `git diff --check` passed.
- The live embedding evaluation was attempted with `.env.local` but stopped before any request because no real `OPENAI_API_KEY` was configured (`local-openai` placeholder). No provider request or charge occurred.

## Unresolved

- Configure a real evaluation key, run `npm run eval:memory:relevance`, review false positives/negatives at 0.76 and neighboring thresholds, then add reviewed, de-identified examples before changing the threshold.
- Local embeddings use OpenAI only in persistent mode with a configured real key; users should account for that provider data flow and usage.
- The workspace contains substantial pre-existing uncommitted changes; they were preserved.

## Recommended Next Step

After resolving the duplicate generated `.next/types` files, run the full check. Then run the labeled relevance evaluation with the intended model and record the precision/recall decision before describing 0.76 as calibrated.
