# Session: Broaden Conversational Learning Coverage

- Date: 2026-10-22
- Time: 21:24 EDT
- Status: Completed
- Scope: Reduce brittle classification and per-turn limits in guarded provider-backed memory extraction, and make extraction failures operationally visible.

## Outcome

When a real provider extractor is configured, eligible learning now runs on ordinary/pattern/low-risk unclear turns plus avoided-spend and regretful-spend turns. It remains excluded during pending approval/correction and real-money-movement requests. The provider and validator can retain up to eight stable, ordinary facts per turn. Exact-evidence, confidence, user-authorship, assertion, stability, sensitivity, and spending-data checks remain in force. Extraction failures preserve the turn response and emit a diagnostic event that contains no message or provider payload.

## Work Completed

- Expanded eligible classification types and added a best-effort failure callback in [victoria-agent.ts](../../src/agent/victoria-agent.ts).
- Raised provider schema and deterministic validator bounds from three to eight; asked the extractor to quote the shortest supporting clause in [openai-conversational-memory-extractor.ts](../../src/agent/memory/openai-conversational-memory-extractor.ts).
- Wired message-free warning callbacks into local and persistent runtime compositions.
- Added tests for five facts in one turn, extraction on avoided-spend while preserving the savings decision, and failure reporting with normal-response fallback in [preference-memory.test.ts](../../tests/unit/agent/preference-memory.test.ts).
- Updated the Story 15, MVP memory boundary, learning schema, and test plan contracts.
- This shared worktree also includes contextual reply personalization and episode-default changes from preceding sessions; those changes remain preserved and were not part of this session's scope.

## Decisions

- Confirmed: broader extraction must not alter classification, financial actions, or approval requirements.
- Confirmed: extraction errors remain non-fatal; operator diagnostics include only a fixed error category, with no user text or provider payload.
- Confirmed: eight facts is the per-turn ceiling; candidates still require exact, short evidence and all existing privacy gates.

## Verification

- Focused: `npx vitest run tests/unit/agent/preference-memory.test.ts tests/unit/app/openai-conversational-memory-extractor.test.ts` — 2 files and 77 tests passed.
- Full: `npm run check` — setup validation, lint, both typechecks, and test suite passed; 65 test files passed, 7 skipped; 555 tests passed, 15 skipped, 9 todo.
- `git diff --check` passed.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts:112` for an assigned-but-unused `_observedThrough` value. SQLite experimental warnings also appeared during tests.
- No live provider extraction, quality, or latency evaluation was run.

## Unresolved

- Broader provider extraction quality and false-positive rates still need evaluation on a labeled corpus; the exact-evidence and privacy checks are guardrails, not a quality guarantee.
- Failure diagnostics use `console.warn`; no centralized metrics/observability backend is configured.

## Recommended Next Step

Add a labeled extraction evaluation set covering mixed financial and personal statements, paraphrases, quoted content, uncertain/third-party statements, and sensitive details; measure useful fact recall alongside false-positive rate before adjusting confidence or evidence thresholds.
