# Session: Repeated evidence for durable habit memories

- Date: 2026-10-29
- Time: 22:42 EDT
- Status: Partial
- Scope: Prevent one-off behavior from being reused as a durable habit and preserve distinct source-turn counts.

## Outcome

Conversational learning now appends a new memory version when the same supported fact appears in a distinct durable turn, preserving earlier records and counting unique source turns. Retries for an already-counted turn remain idempotent. Retrieval requires either explicit recurrence language in the evidence or at least two distinct source records for habit memories.

## Work Completed

- Updated `memory-learning-service.ts` to merge distinct source turn IDs and set `sourceRecordCount` on the new immutable memory version.
- Updated `MemoryOrchestrator` duplicate handling so one overlapping source turn does not suppress a newer distinct turn, while exact retries remain deduplicated.
- Updated `retrieval-planner.ts` to gate habit memories on explicit recurrence evidence or repeated distinct records.
- Added regression tests for retry idempotency, append-only repeated evidence, explicit recurring schedules, and one-off habit suppression.
- Updated the F06 crosswalk and `tests/test-plan.md`.

## Decisions

- Memory habits are descriptive context, not financial evidence or authorization. A single one-off behavior is not surfaced as a durable habit.
- Historical memory versions remain append-only; repeated support creates a superseding version.

## Verification

- Focused memory unit tests — 24 passed.
- `npm run check` — passed: 98 test files passed, 9 skipped; 976 tests passed, 27 skipped, 9 todo.
- Local PostgreSQL integration suite — 20 passed. The loopback `_local` database lacked the queue migration on first run; the opt-in migration runner applied repository migrations to that local database, after which the suite passed.
- `git diff --check` — passed.
- Existing lint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:146` (`_observedThrough` unused).

## Unresolved

- F02 still has separate typed Financial Moment classification and needs a single reviewed orchestration contract plus provider-quality evidence.
- F04 coordinator remains large; F05 unrecognized topic fallbacks remain bounded.
- F06 needs blinded relevance scoring; F07 hosted worker/outage parity and F08 human quality scoring/performance targets remain open.
- No hosted migration, deployment, or real-money action occurred.

## Recommended Next Step

Continue with a small `VictoriaAgent` seam extraction backed by characterization tests, then prepare the human-blinded evaluation packet and record its scoring when a reviewer completes it.
