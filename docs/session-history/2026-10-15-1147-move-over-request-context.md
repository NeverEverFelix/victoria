# Session: Resolve amounts in move-over requests

- Date: 2026-10-15
- Time: 11:47 America/New_York
- Status: Completed
- Scope: Recognize “move over” as a real money movement request and resolve an explicitly referenced earlier amount within the same conversation.

## Outcome

The local classifier recognizes “move over” requests and can attach the latest explicit amount from prior user messages when the user clearly refers to an earlier amount. Victoria refuses real movement, states that no transfer occurred, and does not treat the request as approval to create a mocked savings entry.

## Work Completed

- Updated [`mock-llm.ts`](../../src/agent/llm/mock-llm.ts) to recognize “move over” and resolve a previous amount only when the message explicitly refers to an amount discussed earlier.
- Updated [`victoria-agent.ts`](../../src/agent/victoria-agent.ts) to mention the resolved amount while preserving the real-transfer refusal and existing exact-action confirmation flow.
- Added behavior coverage in [`victoria-agent.test.ts`](../../tests/unit/agent/victoria-agent.test.ts) and expectations in [`test-plan.md`](../../tests/test-plan.md).

## Decisions

- Confirmed: “move over” remains a real-money movement request in the MVP. A transfer request never creates or approves a mocked ledger entry.
- Confirmed: contextual amount resolution is limited to earlier user messages in the same conversation and requires explicit reference language.

## Verification

- `npm run check` passed: agent validation, lint, TypeScript checks, and tests (409 passed, 4 skipped, 9 todo; 6 test files skipped).
- No live provider, Plaid, database, or API key calls were made.

## Unresolved

- This contextual lookup uses the in-memory conversation history in the local mock runtime. Durable history and cross-runtime context recovery remain separate work.

## Recommended Next Step

Exercise the same transfer refusal through the authenticated local chat handler, including a case where the amount was discussed in a prior turn.
