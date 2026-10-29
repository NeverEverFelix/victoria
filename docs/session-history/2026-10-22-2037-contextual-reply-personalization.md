# Session: Contextual Reply Personalization

- Date: 2026-10-22
- Time: 20:37 America/New_York
- Status: Complete for the bounded provider-backed reply slice
- Scope: Broaden ordinary reply personalization beyond a few fixed templates while preserving user-scoped memory and financial safety boundaries.

## Outcome

Added an optional provider-backed rewrite step for ordinary reflections when relevant user-stated or corrected memories are available. It can adapt tone, detail, phrasing, and a small next step while the deterministic agent retains classification and action authority.

## Work Completed

- Added [personalized-reply.ts](../../src/agent/memory/personalized-reply.ts) for grounding and safety validation, and [openai-personalized-reply.ts](../../src/agent/memory/openai-personalized-reply.ts) for non-stored structured provider responses.
- Wired the reply personalizer into local and hosted persistent chat runtimes. A real non-mock provider model and key enable it by default; `OPENAI_PERSONALIZED_REPLIES_ENABLED=false` disables it. Mock/default configuration makes no personalization provider calls.
- Limited model context to the current user message, deterministic baseline, and at most six relevant user-stated/corrected preference, goal, habit, or interest projections. The conversation transcript and transaction-profile facts are not passed to this provider.
- Require supplied memory IDs, preserve any baseline question, reject unsupported amounts, completed-action and money-movement claims, shaming language, and fall back to deterministic wording on invalid output or provider failure.
- Keep exact activity-spend responses and transaction summaries deterministic so source attribution, observation window, and uncertainty language remain intact.
- Added tests for adaptive ordinary replies, decision/action preservation, unsafe output fallback, and structured non-stored provider requests. Updated [Story 15](../user-stories.md), the [test plan](../../tests/test-plan.md), [MVP](../mvp.md), and [environment guide](../environments.md).

## Decisions

- Confirmed implementation boundary: personalization changes only ordinary reflective wording. It cannot classify, estimate, approve, or call financial tools.
- Implementation default: provider-backed rewriting activates with a real model/key unless explicitly disabled. Episode summaries remain separately opt-in.
- Precise spending replies retain the existing deterministic response to preserve source and uncertainty disclosure.

## Verification

- `npm run check` passed: agent setup validation, lint, source and test typechecks, 551 tests passed, 15 skipped, and 9 todo; 7 test files skipped.
- Targeted personalization tests passed: 78 tests across the new reply tests and conversational-memory suite.
- `git diff --check` passed.
- No live provider call or hosted staging smoke was performed.

## Unresolved

- Live model quality, cost, response latency, and relevance across ordinary request types have not been evaluated.
- The chat and memory controls still lack a user-facing product UI under the existing headless-first sequencing rule.
- The `0.76` semantic retrieval threshold remains provisional, so paraphrased memories may be missed or occasionally retrieved incorrectly; the reply layer only uses the bounded retrieved context.

## Recommended Next Step

Run a small blinded set of ordinary conversations with communication-style, goal, routine, interest, unrelated-memory, and no-memory cases against the intended hosted model. Review relevance, tone, latency, and cost before treating the new personalization quality as verified.
