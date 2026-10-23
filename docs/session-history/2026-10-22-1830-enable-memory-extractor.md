# Session: Enable Structured Memory Extraction By Default

- Date: 2026-10-22
- Time: 18:30 America/New_York
- Status: Complete
- Scope: Enable guarded provider-based memory extraction when a real model is configured and keep episodic summaries independently opt-in.

## Outcome

Conversational memory extraction now runs by default with a configured real OpenAI model and API key. Users can disable it with `OPENAI_MEMORY_EXTRACTION_ENABLED=false`. Episodic summaries use a separate `OPENAI_EPISODIC_SUMMARIES_ENABLED` opt-in, preserving a narrower retention default.

## Work Completed

- Split extractor and summarizer runtime gates for local and hosted composition in [local runtime](../../src/app/http/create-local-mock-victoria-runtime.ts) and [persistent runtime](../../src/app/http/create-persistent-chat-runtime.ts).
- Updated environment examples, product docs, Story 15, and the memory decision to describe the new default and separate summary control.
- Updated the environment-example test to assert extraction on and summaries off.
- Enabled extraction in the ignored local `.env.local`, kept summaries off, configured `gpt-5-mini`, and retained PostgreSQL persistent memory. No secrets were included in tracked files or this record.

## Decisions

- Confirmed at the user's direction: provider extraction is enabled when a real provider is configured; explicit `false` disables it.
- Episodic summarization remains opt-in because it creates longer-lived synthesized context and previously shared the extractor flag.
- Existing candidate evidence, user-authorship, confidence, stability, and sensitivity validation remains required. Extraction failures remain non-blocking.

## Verification

- `npm run check` passed: agent setup validation, lint, source/test typechecks, 525 tests passed, 15 skipped, 9 todo, and 7 test files skipped.
- Existing unused-variable ESLint warning and Node SQLite experimental warnings remain.
- No live provider call was made; unit tests used mocked provider responses.

## Unresolved

- A running local development server must be restarted to load the updated ignored `.env.local` values.
- Hosted staging/production deployments must set a real `OPENAI_MODEL` and key to activate extraction. Staging hosted extraction has not been live-smoke-tested.
- The workspace contained substantial pre-existing uncommitted changes; this session preserved them.

## Recommended Next Step

Restart local chat and exercise a few synthetic ordinary preference/habit examples, including a sensitive or speculative negative case, then verify stored facts through the existing local memory controls.
