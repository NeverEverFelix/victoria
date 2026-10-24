# Session: Diagnose agent latency and preserve covered-expense planning flow

- Date: 2026-10-23
- Time: 15:45 America/New_York
- Status: Completed
- Scope: Measure provider latency, improve the covered-gym conversation sequence, and keep annual projections separate from mock-ledger entries.

## Outcome

Identified sequential OpenAI calls as the main contributor to long turn times. Added privacy-safe timings and request metadata for Financial Moment classification, preserved the first-turn planning-horizon question without prematurely asking for ledger approval, and kept annual projections planning-only.

## Work Completed

- Added provider completion and failure logging for Financial Moment classification in [the classifier adapter](../../src/agent/llm/openai-financial-moment.ts). Logs include role, request ID, token counts, status/failure category, and elapsed time without logging prompts or replies.
- Tightened companion and personalization guidance for the covered recurring-expense flow in [the OpenAI specialist prompts](../../src/agent/team/openai-specialists.ts) and [the personalized reply adapter](../../src/agent/memory/openai-personalized-reply.ts).
- Passed validated monthly and annual values into personalized replies and rejected language that offers the annual projection as a recordable ledger amount in [personalized reply validation](../../src/agent/memory/personalized-reply.ts).
- Added typed `deferLedgerConfirmation` context so the first covered-expense response can ask for a planning horizon before requesting approval. The next annual response can ask about one current-month entry. Updated the related response policy and agent wiring.
- Normalized a provider's existing amount-confirmation question to Victoria's ledger instead of appending a duplicate question.
- Preserved pending savings proposals when a low-confidence response is classified as an uncertain revision despite the previous assistant question.
- Updated behavioral expectations in [the test plan](../../tests/test-plan.md) and relevant unit/evaluation coverage.

## Decisions

- Financial Moment owns intent classification; companion voice remains dynamically generated. For the supported gym scenario, the first response asks monthly versus annual planning horizon before asking to record anything.
- Annualized savings remain a conditional projection. Only the current month's amount may be offered for a one-time mocked ledger entry after explicit confirmation.
- Diagnostics are privacy-safe and do not include user text, memory contents, prompts, or generated replies.

## Verification

- Ran the requested CLI conversation with the actual OpenAI-backed team. The observed first request took 8.0 seconds, with Financial Moment at 3.1 seconds and Companion Voice at 3.5 seconds. The annual follow-up took 6.3 seconds, with Financial Moment at 2.3 seconds and personalized reply at 3.6 seconds. Timings vary by provider response.
- The replay asked the user to choose monthly versus annual planning first; the annual follow-up described $420 as conditional and asked only about a current-month $35 mock-ledger entry. No ledger entry was created.
- `npm run check` passed: 65 test files passed, 7 skipped; 561 tests passed, 15 skipped, and 9 todo.
- `git diff --check` passed. Lint reported two pre-existing unused-variable warnings. SQLite experimental-feature warnings remain during local/test runs.
- The local CLI server was stopped; port 3210 is no longer listening.

## Unresolved

- Provider latency remains variable and the turn requires sequential classification and response-generation calls; observed end-to-end times remain roughly 6–11 seconds. The new logs make the slow phase identifiable but do not make the model calls parallel.
- The worktree contains extensive earlier uncommitted changes; they were preserved.

## Recommended Next Step

Collect several turns of the new provider timing logs, then decide whether the classification call can be removed for narrowly validated covered-expense turns without reducing intent or safety quality.
