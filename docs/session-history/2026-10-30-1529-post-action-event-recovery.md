# Session: Persistence failure recovery boundaries

- Date: 2026-10-30
- Time: 15:29 America/New_York
- Status: Partial
- Scope: Preserve committed mocked-ledger acknowledgements across auxiliary history outages and keep optional episode summarization out of the response failure path.

## Outcome

After an approved mocked-ledger mutation has completed, failure to write its conversation savings event gets one idempotent retry and no longer discards the already-built acknowledgement if the retry also fails. A persistent failure is exposed only through a content-free turn trace field. Event-store failures before approval still fail closed. Optional episodic summary creation also returns safely when its summary-history read fails.

## Work Completed

- Updated [victoria-agent.ts](../../src/agent/victoria-agent.ts) to preserve the acknowledgement only when the decision confirms a completed financial mutation, and incremented the trace schema to include `savingsEventPersisted`.
- Added a regression in [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts) covering a healthy proposal write followed by an event-store outage during approval.
- Updated [test-plan.md](../../tests/test-plan.md) and the [conversation architecture follow-up](../architecture/conversation-architecture-spec-follow-up-2026-10-29.md) with the new recovery contract.
- Updated [episodic-memory-service.ts](../../src/agent/memory/episodic-memory-service.ts) so summary-history storage read failures return a best-effort miss; added coverage in [episodic-memory.test.ts](../../tests/unit/agent/episodic-memory.test.ts).
- Made [victoria-agent.ts](../../src/agent/victoria-agent.ts) continue a read-only turn with empty optional memory if retrieval fails, and drop episodic summaries if lifecycle verification fails; added coverage in [victoria-agent.test.ts](../../tests/unit/agent/victoria-agent.test.ts).
- Extracted memory retrieval and enrichment into [conversation-memory-context-service.ts](../../src/agent/conversation-memory-context-service.ts), with service-level tests in [conversation-memory-context-service.test.ts](../../tests/unit/agent/conversation-memory-context-service.test.ts).

## Decisions

- Confirmed: the conversational event is auxiliary after the mocked-ledger mutation commits; the exact action acknowledgement must remain available, while telemetry records whether the event write succeeded.
- Confirmed: event-store failure before approval remains fail-closed.

## Verification

- `npm test -- --run tests/unit/agent/victoria-agent.test.ts` — 197 tests passed.
- `npm run check` — passed after all changes: lint, source/test type checks, agent setup validation, and 1,040 tests passed (27 skipped, 9 todo; 9 test files skipped).
- `git diff --check` — passed.
- SQLite experimental-feature warnings remain unchanged.

## Unresolved

- This does not make a ledger write and durable turn completion atomic; a process crash between them remains open.
- Hosted multi-worker outage/recovery parity and live provider evaluation remain open review gates.
- The repository worktree contains other accumulated review-follow-up changes; this session did not isolate or revert them.

## Recommended Next Step

Continue the F04 coordinator reduction through one behavior-preserving extraction, or address process-crash recovery only after confirming the durable ledger/turn transaction boundaries.
