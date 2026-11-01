# Session: Durable Action Acknowledgement Recovery

- Date: 2026-10-30
- Time: 14:55 America/New_York
- Status: Partial
- Scope: Close the local recovery gap when a completed mocked financial action is followed by an assistant transcript write failure.

## Outcome

Completed mock-ledger mutations now retain and return their already-built response if only the assistant transcript write fails. With durable turn storage configured, the synchronous chat handler stores that response as the completed turn result; the authenticated result endpoint can retrieve the acknowledgement. The underlying tool mutation is not repeated.

## Work Completed

- Updated [`victoria-agent.ts`](../../src/agent/victoria-agent.ts) to preserve the response for decisions that prove a completed mocked mutation (`create_ledger_entry`, recorded goal allocation, or completed entry correction). Other transcript persistence failures still propagate.
- Added content-free `assistantTranscriptPersisted` to the turn trace and bumped its schema version to 3.
- Changed the prior agent regression to verify it returns the recorded-entry acknowledgement and that retrying does not duplicate the ledger entry.
- Added an HTTP integration regression in [`victoria-chat-handler.test.ts`](../../tests/unit/app/victoria-chat-handler.test.ts) that verifies the turn completes, stores the exact result, and returns it through the authenticated result endpoint with one ledger entry.
- Updated the F07/C07 evidence and test expectations in the review crosswalk and [`tests/test-plan.md`](../../tests/test-plan.md).
- The workspace already contained extensive uncommitted follow-up work before this slice. No commit, deployment, hosted migration, or real-money operation was performed.

## Decisions

- A successful mutation must not be reported as failed only because transcript persistence failed after the action; the response is returned for durable turn-result storage.
- Mutation and turn-result storage are still separate persistence boundaries. This change does not claim atomicity across them or cover process termination between the writes.
- Existing approval, user scope, mocked-ledger-only, and idempotency boundaries remain authoritative.

## Verification

- First ran the changed regression before implementation and confirmed it failed at the assistant transcript write.
- `npx vitest run tests/unit/agent/victoria-agent.test.ts tests/unit/app/victoria-chat-handler.test.ts`: 202 passed.
- `npm run check`: passed; 107 test files passed, 9 skipped; 1,020 tests passed, 27 skipped, 9 todo.
- `git diff --check`: passed.
- SQLite experimental warnings appeared during the suite.

## Unresolved

- Atomic recovery if the process terminates after the mocked tool write and before the durable turn is completed remains unverified and requires a separate transaction/outbox contract.
- Hosted persistence outages and multi-worker parity remain unverified.
- Other review findings still require provider-backed evaluation, blinded human quality review, and accepted performance targets.

## Recommended Next Step

Continue code-side F04/F05 parity work in small slices, then run the authorized provider comparison with route counters and arrange the human review gate. Keep hosted operations and the real-money prohibition unchanged.
