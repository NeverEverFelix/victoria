# Session: Live revision approval safety

- Date: 2026-10-26
- Time: 16:16 America/New_York
- Status: Completed
- Scope: Exercise the real-provider local workflow for an ambiguous pending-savings revision and close safety gaps found in that conversation.

## Outcome

A real-provider local conversation now safely handles an ambiguous amount revision: “$6 or $8” triggers clarification, a stale “Yes” cannot approve the old proposal, “Use $8” creates a replacement awaiting confirmation, and a fresh “Yes” records exactly $8 in the mocked ledger. No database was configured for this run and no real money moved.

## Work Completed

- Updated [conversation-state-manager.ts](../../src/agent/conversation-state-manager.ts) so a clear revision reference containing “or” still binds to the active proposal; the amount parser and ambiguity guard decide whether the proposed amount is usable.
- Added a deterministic pre-classifier gate in [victoria-agent.ts](../../src/agent/victoria-agent.ts) for ambiguous amounts on an explicitly referenced proposal, and deterministic handling of a single valid amount answer while that clarification is pending.
- Extended simple amount replies to include explicit forms such as “Use $8.”
- Added and passed a unit regression covering ambiguous revision, blocked stale approval, and replacement proposal creation. Existing pending-action persistence retains the clarification state across agent restarts.
- Ran a temporary real-provider local HTTP workflow smoke against the in-memory mock savings tools. The temporary test was removed after the run to prevent ordinary test commands from making provider calls.

## Decisions

- Ambiguous amounts do not mutate the proposal. The user must resolve the amount before Victoria asks for fresh approval.
- After clarification, a valid amount-only reply can be resolved deterministically against the active revision clarification; the original proposal remains unapprovable.
- The route response exposes the action and user-facing message, not internal proposal records. The live smoke therefore checked the confirmation wording, terminal action, and recorded amount in the mocked ledger response.

## Verification

- Live local provider smoke: passed. Conversation completed through mocked ledger recording for $8.00.
- Focused tests: `npx vitest run tests/unit/agent/conversation-state-manager.test.ts tests/unit/agent/victoria-agent.test.ts` passed, 131/131.
- `npm run check`: passed; 688 tests passed, 20 skipped, 9 todo.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` for `_observedThrough`; Node emitted the existing experimental SQLite warning.

## Unresolved

- The cumulative architecture and conversation-state changes remain local and uncommitted. Do not assume this session pushed or deployed them.
- The live smoke used local in-memory mocks; it did not verify persistent PostgreSQL behavior. Existing PostgreSQL restart coverage remains in the integration suite.
- Companion-voice live replies were verbose and occasionally over-celebratory; tone tuning is separate from the approval-safety finding.

## Recommended Next Step

- Continue with the next bounded conversation-state gap from the work queue, preserving approval gates and append-only history; review the cumulative diff before committing or deploying.
