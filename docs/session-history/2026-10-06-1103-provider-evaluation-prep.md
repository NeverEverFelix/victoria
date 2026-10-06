# Session: Prepare the provider evaluation

- Date: 2026-10-06
- Time: 11:03 America/New_York
- Status: Partial; evaluation preparation completed, runtime comparison not yet executable
- Scope: Inspect evaluation code and documentation, then prepare a frozen 50-turn corpus and blinded review materials.

## Outcome

Added a frozen, synthetic 50-turn corpus and reviewer/report templates. Updated the evaluation protocol and readiness docs to distinguish the prepared gate from the current seven-case smoke command. No provider calls were made.

## Work Completed

- Added [provider-eval-v1.json](../../tests/evaluation/fixtures/provider-eval-v1.json), with 50 unique cases across avoided spend, estimates, amount ambiguity, unclear approval, regret, transfer boundaries, adversarial wording, specialist disagreement, and linked corrections.
- Added [blinded-review.csv](../../tests/evaluation/templates/blinded-review.csv) and [provider-run-report.json](../../tests/evaluation/templates/provider-run-report.json).
- Updated the [evaluation protocol](../architecture/multi-agent-evaluation-protocol.md), [readiness checklist](../architecture/multi-agent-readiness.md), and [evaluation README](../../tests/evaluation/README.md).
- Frozen corpus SHA-256: `2bf4b48684abe591d2108afafc059bed871735f0caa6c53b43f33e13a24e562c`.

## Decisions

- The live comparison remains blocked on a complete provider-backed baseline and specialist arm. The current adapter classifies Financial Moments only; the existing seven-case command is a smoke check, not a 50-turn comparison.
- The blinded review requires two independent reviewers, per-case randomized A/B labels, and an unblinding key held until both have submitted.
- Provider evaluation remains separate from server persistence. Real money movement remains prohibited under the MVP contract.
- These are evaluation procedure details, not a change to product behavior or a selection of a production model.

## Verification

- Parsed the new corpus and report-template JSON and confirmed 50 unique case IDs.
- Recomputed and recorded the corpus SHA-256.
- `git diff --check` — passed.
- No unit tests, live provider calls, or cost-incurring evaluation requests were run.

## Unresolved

- No runner currently consumes the 50-turn corpus or compares complete user-visible baseline and specialist turns.
- No blinded responses or ratings exist yet.
- Provider-reported tokens, rate-card cost, latency, and comparative quality remain unmeasured.
- Production authentication, durable storage, and cross-process conversation handling remain a separate unfinished track.

## Recommended Next Step

Build the headless evaluation runner that feeds this exact corpus to both full runtime arms with identical mock memory, tools, and deterministic safety policy. Capture per-role timing, token usage, retries, and rate-card cost; then produce anonymized response pairs for the two reviewers. Do not make a runtime migration decision until those results and all safety checks are reviewed.
