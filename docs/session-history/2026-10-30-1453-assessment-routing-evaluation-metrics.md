# Session: Assessment Routing Evaluation Metrics

- Date: 2026-10-30
- Time: 14:53 America/New_York
- Status: Partial
- Scope: Continue closing code-addressable findings from the 2026-10-29 conversation architecture review.

## Outcome

Added content-free financial-assessment route counts to live provider-comparison output, so future runs can quantify the classifier skip alongside provider cost and latency. The implementation and repository checks pass. Review-wide evidence and operational gates remain open.

## Work Completed

- Added a per-target-turn `financialAssessmentRoute` and per-arm counts for assessed, skipped plain-question, skipped model-dialogue, and pending-amount routes in [`run-provider-comparison.ts`](../../tests/evaluation/run-provider-comparison.ts). Stateful setup routes are cleared before the target turn so setup activity cannot contaminate target counts.
- Added assertions in [`provider-comparison.test.ts`](../../tests/evaluation/provider-comparison.test.ts) and updated the report template, evaluation README/protocol, and review crosswalk.
- The repository already had content-free route instrumentation and the memory-learning coordinator extraction from this work period; their direct tests passed before the full check.
- The workspace contained many prior uncommitted review-follow-up changes before this session. No commit, deployment, hosted migration, or real-money action was performed.

## Decisions

- Route metrics contain only fixed categories. They do not include conversation text or model rationale.
- A missing route outcome remains distinct from a skip; failures are not counted as evidence of assessment savings.
- No product or money-movement boundary changed.

## Verification

- `npx vitest run tests/evaluation/provider-comparison.test.ts`: 3 passed.
- `git diff --check`: passed.
- `npm run check`: passed; 107 files passed, 9 skipped; 1,019 tests passed, 27 skipped, 9 todo.
- SQLite experimental warnings appeared during the suite.

## Unresolved

- F08 still needs a fresh provider-backed comparison after the classifier-skip optimization; this local runner change only enables the measurement.
- F01/F03/F05/F06 conversational quality and memory relevance need blinded human scoring. Existing synthetic and unit results are not quality evidence.
- F02 remains partially unified: interpretation is advisory and contextual, while deterministic pending-workflow and financial-specialist stages remain separate where policy requires them.
- F04 still has a large `VictoriaAgent` coordinator despite incremental extractions.
- F07 acknowledgement replay after a post-action transcript write failure, hosted outage/recovery, and multi-worker parity remain open.
- Hosted authentication/ownership, migration/deployment, operations, accepted cost/latency targets, and retention/access review are outside local verification.

## Recommended Next Step

Use the content-free route categories in the next authorized provider-backed comparison and pair those measurements with the existing blinded review packet. Continue only low-risk coordinator extractions with parity tests; leave hosted operations and approval boundaries unchanged.
