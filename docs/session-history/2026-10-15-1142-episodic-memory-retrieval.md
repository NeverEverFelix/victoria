# Session: Use relevant episodic summaries in replies

- Date: 2026-10-15
- Time: 11:42 America/New_York
- Status: Completed
- Scope: Let fresh, relevant episodic summaries support ordinary reflective replies.

## Outcome

Validated episodic summaries can now reconnect an ordinary reflective reply to a prior topic when the episode is current and clearly related to the user's message.

## Work Completed

- Added `isUsableEpisodicSummary` in [`episodic-summary.ts`](../../src/agent/memory/episodic-summary.ts). It accepts only summary memories with expected category/source/metadata, confidence and evidence, a non-future timestamp within 90 days, and at least two matching meaningful terms.
- Connected eligible summaries to the ordinary reflective response path in [`victoria-agent.ts`](../../src/agent/victoria-agent.ts). They do not affect financial classifications, estimates, approvals, or ledger actions.
- Expanded [`episodic-memory.test.ts`](../../tests/unit/agent/episodic-memory.test.ts) to cover cross-conversation recall, unrelated topics, stale episodes, and future timestamps.
- Documented the freshness and relevance boundary in [`user-stories.md`](../user-stories.md), [`test-plan.md`](../../tests/test-plan.md), [`mvp.md`](../mvp.md), and [`user-learning-schema.md`](../specification/user-learning-schema.md).

## Decisions

- Confirmed for this behavior slice: episodic summaries older than 90 days, future-dated, malformed, or not sharing at least two meaningful topic terms with the current turn are not surfaced.
- Confirmed: episodic content is context for ordinary replies only and never authorizes a financial action.

## Verification

- Targeted episodic memory test passed (4 tests).
- `npm run check` passed: agent validation, lint, both TypeScript checks, and tests (405 passed, 4 skipped, 9 todo; 6 test files skipped).
- No live provider, Plaid, or database calls were made.

## Unresolved

- The local runtime's memories remain process-local, and the default route is not connected to durable storage.
- Topic matching is deliberately conservative and lexical in the mock behavior; broader semantic relevance depends on the configured memory search provider.

## Recommended Next Step

Verify episodic continuity through the authenticated local chat handler, then continue with the local mock chat UX. Durable memory, trusted login/session issuance, and live runtime work remain separate follow-ups.
