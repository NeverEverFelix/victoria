# Session: Typed understood-turn routing handoff

- Date: 2026-10-29
- Time: 22:48 EDT
- Status: Partial
- Scope: Consolidate the inputs to read-only conversation dispatch into one typed handoff.

## Outcome

Read-only dialogue routing now receives one `UnderstoodTurn` value containing the current message, deterministic intent plan, advisory model plan, and typed financial classification category. Existing precedence is unchanged: deterministic route checks and pending-workflow handling remain authoritative, and model interpretation cannot authorize an action.

## Work Completed

- Added `UnderstoodTurn` in `conversation-intent-plan.ts` and converted the dispatcher and agent call site to use it.
- Updated routing tests to exercise the combined contract, including cases where action wording or ambiguous approval must remain outside the read-only path.
- The same-session F06 change also records distinct source turn IDs and applies a repeated-evidence gate to habit retrieval; its status and coverage are in `docs/architecture/conversation-architecture-spec-follow-up-2026-10-29.md` and `tests/test-plan.md`.

## Decisions

- The handoff is a routing description only. It contains no approval capability, target ID, amount, or executable tool call.
- The Financial Moment classifier remains a separate service call where necessary; F02 is still partial.

## Verification

- Focused routing and agent tests — 226 passed.
- `npm run check` — passed: 98 test files passed, 9 skipped; 976 tests passed, 27 skipped, 9 todo.
- Local PostgreSQL integration suite — 20 passed after applying repository migrations to the loopback `_local` database.
- `git diff --check` — passed.
- Existing lint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:146` (`_observedThrough` unused).

## Unresolved

- F02 still needs a unified end-to-end orchestration boundary and provider quality evidence; F04 still needs further coordinator extraction; F05 unrecognized topic fallbacks remain bounded.
- F06 blinded relevance review, F07 hosted worker/outage parity, and F08 human quality scoring and approved performance targets remain open.
- No hosted migration, deployment, or real-money action occurred.

## Recommended Next Step

Continue with an individually testable coordinator seam, keeping exact workflow approval and persistence inside their current deterministic service boundaries. Human-blinded and hosted checks require their respective reviewers and environments before those findings can be marked complete.
