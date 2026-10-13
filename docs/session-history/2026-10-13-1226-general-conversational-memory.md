# Session: Extract general preferences, habits, and goals

- Date: 2026-10-13
- Time: 12:26 America/New_York
- Status: Implemented and checked; live PostgreSQL verification pending
- Scope: Extend explicit conversational-memory extraction from savings preferences to supported general preferences, recurring habits, and stated goals.

## Outcome

Victoria now extracts a bounded set of direct preferences, recurring habits, and explicit goals into structured user-scoped facts. Each fact retains the original utterance as evidence and a confidence value. Identical statements are deduplicated; changes append a linked fact. Memory acknowledgements create no savings proposal or goal allocation.

The PostgreSQL fact table is the durable structured source for future semantic/vector indexing. This slice does not generate embeddings or perform vector search.

## Work Completed

- Added failing general-memory behavior tests before extraction implementation, then passed them after adding the extractor.
- Extended [the extractor](../../src/agent/memory/extract-preference.ts) with direct preference, frequency-marked habit, and explicit goal patterns plus uncertainty filtering.
- Updated [VictoriaAgent](../../src/agent/victoria-agent.ts) to persist extracted facts, deduplicate identical facts, and append linked updates.
- Updated the safety contract with `MEM-002` and `MEM-003` coverage for preferences, habits, goals, evidence, no-action semantics, and append-only updates.
- Updated the MVP, user story, work queue, and test plan with the supported scope and PostgreSQL semantic-index source boundary.

## Decisions

- Confirmed: only directly stated, unambiguous facts matching the supported patterns are automatically remembered.
- Confirmed: a remembered goal is informational memory and does not create a savings goal allocation.
- Confirmed: structured PostgreSQL facts can support a future semantic/vector index; embeddings and vector search are separate work.
- Automatic extraction remains bounded to explicit patterns and does not cover arbitrary natural language.

## Verification

- `npm run check` — passed: 32 test files passed (6 skipped), 330 tests passed (4 skipped, 9 todo).
- `git diff --check` — passed.
- Node emitted its experimental-feature warning for built-in `node:sqlite`. No PostgreSQL instance was configured, so migration and live fact-store behavior remain unverified.

## Unresolved

- The default application composition still uses mock memory; production provider wiring and SQLite path/lifecycle remain open.
- Migration 0003 and the append-only/supersession constraints need verification against PostgreSQL.
- Natural-language extraction coverage needs further examples and review before expanding beyond the explicit patterns.

## Recommended Next Step

Configure an integration-test PostgreSQL database, apply migrations 0001–0003, and verify fact insertion, duplicate handling, cross-user isolation, and supersession links before wiring the durable provider into a runtime.
