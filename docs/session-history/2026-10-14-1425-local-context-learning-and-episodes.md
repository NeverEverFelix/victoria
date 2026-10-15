# Session: Local Context Learning And Episodic Summaries

- Date: 2026-10-14
- Time: 14:25 EDT
- Status: Partial
- Scope: Connect optional contextual memory extraction to the local chat route, add bounded episodic summaries, and harden candidate evidence checks without making live calls.

## Outcome

The local chat route can opt into structured contextual learning and episodic summaries with `OPENAI_MEMORY_EXTRACTION_ENABLED=true`, a non-placeholder API key, and a provider model. The feature is disabled by default. When enabled, extraction and summaries use OpenAI, while classification, memory storage, and ledger tools stay mock-backed. No calls were made during this session.

## Work Completed

- Hardened candidate checks in [`conversational-memory-extractor.ts`](../../src/agent/memory/conversational-memory-extractor.ts): confidence threshold, exact evidence, user subject, affirmed assertion, stability, sensitivity, lexical rejection of sensitive/negated/hypothetical content, and conservative quoted/third-party checks.
- Added a mock-tested [`OpenAiConversationalMemoryExtractor`](../../src/agent/memory/openai-conversational-memory-extractor.ts) and optional local runtime wiring.
- Added bounded episodic summarization in [`episodic-summary.ts`](../../src/agent/memory/episodic-summary.ts), with evidence quote validation and append-only `other` memory records when the 20-message context is about to roll over.
- Added a mock-tested [`OpenAiEpisodicMemorySummarizer`](../../src/agent/memory/openai-episodic-memory-summarizer.ts). It receives only a bounded subset of user messages that pass deterministic sensitive and transaction-detail filters and sends requests with `store:false`.
- Updated the local mock classifier to recognize ordinary first-person context statements, so the opt-in extraction path can run during local development.
- Updated `.env.example`, environment guidance, the user story, MVP description, work queue, and test plan. No memory review/edit UI was added.
- This entry supersedes the partial extraction status from [`2026-10-14-1411-structured-memory-extraction-boundary.md`](2026-10-14-1411-structured-memory-extraction-boundary.md).

## Decisions

- Both model features are opt-in and local-only; they are disabled in the example environment.
- Extraction stores no more than three stable ordinary facts from the current user turn. Uncertain attribution, negation, hypothetical statements, low confidence, and sensitive content are rejected.
- Episodic summaries are separate inferred memory records, generated only as short-term context reaches its limit. Evidence quotes must occur in user messages; transaction-detail and sensitive messages are excluded before the summarizer sees them.
- Extraction and summary failures do not block a chat turn or approve financial actions.
- Episodic summaries and explicit facts are still stored in process-local mock memory on the local chat route; durable memory remains unconfigured.

## Verification

- Focused memory and episodic tests passed (34 tests across the two agent suites); provider-adapter tests passed with mocked fetchers.
- `npm run check` passed: 47 test files passed, 6 skipped; 400 tests passed, 4 skipped, 9 todo.
- `git diff --check` passed.
- No live OpenAI, Plaid, Supabase, or banking calls were made.

## Unresolved

- The local opt-in will make OpenAI calls after a user turn when configured. It has not been evaluated with a real model; deterministic evidence checks are defense in depth, not a perfect sensitive-data classifier.
- The route still lacks a trusted login/session issuer and durable memory storage, so state is process-local and disappears on restart.
- Broader extraction quality and usefulness need evaluation before enabling the flag for live users. Episodic summary relevance also needs evaluation.
- Other uncommitted financial-profile, memory, route, and documentation changes in the shared worktree were preserved.

## Recommended Next Step

Keep the feature flag off. Add a local end-to-end test that sends ordinary contextual messages through the mounted route with a mocked fetcher, then define privacy/retention and durable-memory behavior before any live model or database use.
