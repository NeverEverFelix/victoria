# Session: Broaden Semantic Personalization Recall

- Date: 2026-10-22
- Time: 18:46 America/New_York
- Status: Completed for the bounded headless behavior
- Scope: Improve recall of relevant episodic summaries and interests when users phrase topics differently, while retaining freshness, use-context, and financial-action boundaries.

## Outcome

Hosted vector retrieval now returns its cosine similarity score to the agent, and relevant paraphrases can pass an initial 0.76 relevance threshold. The interest reply path now preserves that score through its final context check. A concrete planning, routine, goal, or spending cue is still required to personalize an interest. Episode creation remains limited to explicit conversation finish or context rollover.

## Work Completed

- Added internal `semanticSimilarity` metadata to retrieved memories and selected the score returned by PostgreSQL search in [PostgresMemoryRepository](../../src/agent/memory/postgres-memory-repository.ts).
- Added a shared initial threshold and let episodic recall use either that semantic score or two meaningful shared terms across episode summary and evidence in [episodic-summary.ts](../../src/agent/memory/episodic-summary.ts).
- Let interests match by semantic score as well as exact/known aliases, and fixed score propagation into the final personalized response in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Added positive and negative recall coverage in [episodic-memory.test.ts](../../tests/unit/agent/episodic-memory.test.ts), [preference-memory.test.ts](../../tests/unit/agent/preference-memory.test.ts), and [semantic-memory.test.ts](../../tests/unit/app/semantic-memory.test.ts).
- Updated [MVP memory boundary](../mvp.md), [Stories 20 and 21](../user-stories.md), [user learning schema](../specification/user-learning-schema.md), and [test plan](../../tests/test-plan.md).

## Decisions

- Confirmed: similarity broadens candidate topic recall; it does not bypass freshness, validation, user scope, or concrete use-context requirements.
- Confirmed: episodic summaries still require explicit conversation finish or context rollover to be created and never affect financial decisions or approvals.
- Implementation setting: 0.76 is an initial conservative threshold, not a threshold calibrated with hosted user examples.

## Verification

- `npx vitest run tests/unit/agent/preference-memory.test.ts tests/unit/agent/episodic-memory.test.ts tests/unit/app/semantic-memory.test.ts` passed: 77 tests.
- `npm run check` passed: 532 tests passed, 15 skipped, 9 todo; 7 files skipped.
- `git diff --check` passed.
- Existing ESLint warning for `_observedThrough` and Node SQLite experimental warnings remain.

## Unresolved

- The 0.76 threshold needs relevance evaluation against representative hosted queries, especially false-positive/false-negative paraphrases.
- Local persistent memory has no vector embeddings, so its fallback path still depends on exact aliases and lexical episode overlap.
- The workspace contains substantial pre-existing uncommitted changes; they were preserved and are not attributed to this session.

## Recommended Next Step

Evaluate a small authenticated staging set of paraphrased-interest and paraphrased-episode examples, including unrelated and incidental-mention negatives, before changing the threshold or broadening cue rules.
