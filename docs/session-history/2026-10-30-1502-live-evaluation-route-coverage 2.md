# Session: Live Evaluation Route Coverage

- Date: 2026-10-30
- Time: 15:02 America/New_York
- Status: Partial
- Scope: Improve F08 live evaluation coverage and audit early F01 contextual-understanding bypasses.

## Outcome

Extended the opt-in live conversation challenge to explicitly measure the model-approved plain-dialogue assessment skip and content-free reply fallback outcomes. During the F01 audit, identified several non-pending domain-specific fast paths that still return before contextual turn understanding; the crosswalk now records them as open work.

## Work Completed

- Passed content-free financial-assessment route telemetry through [`create-victoria-agent.ts`](../../src/app/create-victoria-agent.ts).
- Updated [`provider-conversation-challenge-live.test.ts`](../../tests/evaluation/provider-conversation-challenge-live.test.ts) with an unpunctuated, no-pending dialogue turn. It asserts `skipped_model_dialogue`, turn-understanding and companion-voice calls, and a non-fallback response. It reports provider roles/timing plus reply attempt/fallback counts and rate.
- Updated the evaluation instructions and F08 crosswalk; the provider-backed test remains opt-in and was not run against a live provider.
- Updated the F01 crosswalk after tracing `respondTurn`: read-only history/projection and remembered-spend/speculative-claim fast paths can return before the advisory plan, in addition to exact pending-workflow policy. Their multi-intent behavior remains to be audited.
- The repository already had broad uncommitted review-follow-up work. No commit, deployment, hosted migration, or real-money operation was performed.

## Decisions

- Keep exact approval/pending-workflow policy deterministic.
- Make the provider route/fallback instrumentation content-free and keep chargeable live evaluation opt-in.
- Do not label F01 closed while semantic/domain fast paths that bypass contextual model understanding remain unreviewed.

## Verification

- Focused provider-comparison, VictoriaAgent, and chat-handler tests: 205 passed.
- `git diff --check`: passed before final documentation updates.
- `npm run check`: passed; 108 test files passed, 9 skipped; 1,022 tests passed, 27 skipped, 9 todo.
- SQLite experimental warnings appeared during the suite.

## Unresolved

- The live conversation challenge and post-optimization provider comparison have not been run against a live provider.
- F01/F02 still need targeted audit and likely changes for early semantic fast paths; preserve fail-closed workflow policy.
- Blinded human quality review, approved cost/latency targets, hosted outage/multi-worker parity, and remaining F04 coordinator work remain open.

## Recommended Next Step

Audit each pre-understanding return in `respondTurn`, identify whether it is a safety-critical exact workflow, deterministic calculation, or broad semantic route, then move broad semantic paths behind the contextual advisory plan with parity tests.
