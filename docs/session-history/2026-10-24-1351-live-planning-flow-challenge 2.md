# Session: Challenge the covered-expense planning flow in live chat

- Date: 2026-10-24
- Time: 13:51 EDT
- Status: Completed
- Scope: Replay the user's covered recurring expense through the local OpenAI CLI and probe follow-ups, refusals, projections, and approval persistence.

## Outcome

The planning choice advances without replaying the question. Live probes also exposed and led to fixes for direct refusals with a second question, personalized replies that reopened a declined ledger proposal, and a selected horizon lost when another worker restored an append-only pending proposal. A later explicit approval recorded only the monthly amount in the mocked ledger.

## Work Completed

- Expanded direct decline interpretation in [policy.ts](../../src/agent/policy.ts) and added [policy tests](../../tests/unit/agent/policy.test.ts).
- Continued a separate question after declining a pending proposal, preserving its terminal transition, and recovered the selected horizon from the scoped conversation on worker restoration in [victoria-agent.ts](../../src/agent/victoria-agent.ts). Added restart-style and combined-turn [agent tests](../../tests/unit/agent/victoria-agent.test.ts).
- Restricted reflective personalized drafts from reopening ledger recording or recommending specific investments in [personalized-reply.ts](../../src/agent/memory/personalized-reply.ts). Added instruction and revision feedback in [openai-personalized-reply.ts](../../src/agent/memory/openai-personalized-reply.ts) and corresponding [validator tests](../../tests/unit/agent/personalized-reply.test.ts).
- Updated the [test plan](../../tests/test-plan.md).

## Decisions

- A refusal is terminal for the pending mocked-ledger proposal even when the user asks a separate question in the same turn.
- Reflective wording has no authority to initiate another ledger proposal after a decline.
- The persistent proposal snapshot remains append-only; the current planning selection is recovered from scoped conversation context rather than rewriting the historical proposal.

## Verification

- Replayed the user's opening in a fresh local OpenAI conversation. The annual answer advanced directly to a separate current-month ledger question.
- A real-transfer request was refused. A direct refusal with a separate advice question was honored; after the wording guard, a later projection question was answered without reopening ledger recording.
- In a fresh conversation, “yes” to the initial planning question did not record anything; an annual choice, ambiguous ledger reply, and later explicit “yes” resulted in one $35 mocked-ledger entry. The reported weekly total included a pre-existing local entry for the stable CLI test identity. No real money moved.
- `npm run check` passed: 65 test files and 577 tests passed, 15 skipped, 9 todo. Lint retained two existing unused-variable warnings; SQLite emitted experimental warnings. `git diff --check` passed.
- The local CLI server was stopped after testing.

## Unresolved

- Provider wording on the first reply varied across runs and sometimes became long or used process language. The functional and safety paths passed, but first-turn voice quality still merits a separate evaluation.
- The test used the stable local CLI identity and left an append-only mocked ledger entry; this is test data, not a transfer.
- The working tree already contained other uncommitted work, which was preserved.

## Recommended Next Step

Evaluate first-turn wording across varied covered expenses and interests, then tighten the Companion Voice quality guard using general criteria rather than fixed response text.
