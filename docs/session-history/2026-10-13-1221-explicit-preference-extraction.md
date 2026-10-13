# Session: Extract explicit savings preferences

- Date: 2026-10-13
- Time: 12:21 America/New_York
- Status: Implemented and checked
- Scope: Recognize clear user-stated savings contribution preferences and append them to durable conversational memory.

## Outcome

Victoria now recognizes explicit USD comparisons such as “I prefer saving $20 rather than $50 at a time.” It records an evidence-backed preference, acknowledges the memory, and does not create a savings proposal or ledger entry. Tentative, malformed, or equal-amount comparisons are ignored. A changed preference appends a linked fact rather than rewriting the prior one.

## Work Completed

- Added [preference-memory behavior tests](../../tests/unit/agent/preference-memory.test.ts) before implementing the extraction behavior; verified they failed for the missing extraction path.
- Added deterministic [savings preference extraction](../../src/agent/memory/extract-preference.ts) and an early safe memory response in [VictoriaAgent](../../src/agent/victoria-agent.ts).
- Added evidence/confidence and supersession assertions, user isolation, and checks that preference statements do not suggest or record savings.
- Added safety contract rules `MEM-002` and `MEM-003`, and updated the user story, MVP scope, and test plan.
- Existing conversational memory facts are injected into provider-backed Financial Moment and Savings Reasoning context.

## Decisions

- Extraction is deliberately limited to explicit USD savings-amount comparisons with a direct preference phrase.
- The stored preference example is not seeded as a real user's preference; extraction requires that user to say it.
- Other preference types, natural-language variants outside the explicit patterns, and confidence calibration remain future work.

## Verification

- `npm run check` — passed: 32 test files passed (6 skipped), 326 tests passed (4 skipped, 9 todo).
- `git diff --check` — passed.
- Node emitted its experimental-feature warning for built-in `node:sqlite`; no live PostgreSQL instance was configured.

## Unresolved

- PostgreSQL migration 0003 and fact insertion/append-only triggers still need live database verification.
- The durable provider is not yet selected by default production composition; SQLite path and lifecycle remain unconfigured.
- Preference extraction remains intentionally narrow and does not yet learn general preferences, habits, or goals.

## Recommended Next Step

Verify migration 0003 and preference-fact queries against PostgreSQL, then add reviewed variants for other preference categories without broadening extraction to uncertain language.
