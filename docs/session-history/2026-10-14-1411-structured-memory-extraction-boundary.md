# Session: Structured Memory Extraction Boundary

- Date: 2026-10-14
- Time: 14:11 EDT
- Status: Partial
- Scope: Add a bounded extractor contract for learning stable contextual facts from ordinary user turns without enabling provider calls in the default local route.

## Outcome

Victoria now has an optional structured memory extractor boundary. When explicitly injected, it can propose stable contextual facts from an ordinary user turn. The agent stores only high-confidence, ordinary, stable candidates whose exact evidence appears in that turn. The default local route does not inject the extractor, so no provider calls or broad automatic extraction are active by default. Episodic summaries are still future work.

## Work Completed

- Added candidate schema and validation in [`conversational-memory-extractor.ts`](../../src/agent/memory/conversational-memory-extractor.ts): at most three candidates, confidence at least 0.85, stable, non-sensitive, exact quoted evidence, bounded values and keys.
- Added the optional agent hook in [`victoria-agent.ts`](../../src/agent/victoria-agent.ts). It runs only for ordinary `general_finance` turns with no pending financial approvals and fails open if extraction fails.
- Added [`OpenAiConversationalMemoryExtractor`](../../src/agent/memory/openai-conversational-memory-extractor.ts), using a strict JSON schema and `store:false`. It performs network calls only when explicitly constructed and called.
- Added mocked coverage for extraction, validation, saving, and later retrieval in [`preference-memory.test.ts`](../../tests/unit/agent/preference-memory.test.ts) and the adapter contract in [`openai-conversational-memory-extractor.test.ts`](../../tests/unit/app/openai-conversational-memory-extractor.test.ts).
- Updated the learning schema, work queue, and test plan to distinguish the optional boundary from active runtime behavior.

## Decisions

- Only stable contextual facts explicitly supported by the current user turn may be stored through this path.
- Temporary, sensitive, low-confidence, unsupported, or malformed candidates are discarded.
- The extractor is not mounted into the local mock chat runtime. No OpenAI request was made.
- Episodic conversation summaries remain a separate future slice; no review/edit memory UI is added.

## Verification

- `npx vitest run tests/unit/agent/preference-memory.test.ts` passed (31 tests).
- `npm run check` passed: 45 test files passed, 6 skipped; 395 tests passed, 4 skipped, 9 todo.
- `git diff --check` passed.
- The OpenAI adapter used a mocked fetcher; no live API, Plaid, Supabase, or banking calls were made.

## Unresolved

- The optional extractor is not configured in the local route, and memory extraction behavior has not been evaluated with a real model.
- The model's sensitivity label is not a perfect detector; live enablement needs adversarial and privacy-focused evaluation before use.
- Durable runtime, login/session issuance, and episodic summarization remain unimplemented or unconfigured.
- Other uncommitted financial-profile, memory, route, and documentation work in the shared worktree was preserved.

## Recommended Next Step

Before wiring the extractor into a running chat, add adversarial mocked cases for indirect, quoted, negated, and third-party statements; then build episodic summaries as a separate, provenance-linked memory type with explicit limits on what conversation content can be retained.
