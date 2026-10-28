# Session: Start Victoria's turn context builder

- Date: 2026-10-25
- Time: 16:19 EDT
- Status: Completed first slice
- Scope: Ground multi-event planning references and possible repeated savings requests in a typed conversation context.

## Outcome

Victoria can answer a conditional annual projection across two recently stated recurring costs, retain a separate buffer question after a refusal, and ask whether a paraphrased recorded request is a new occurrence before opening another proposal. The provider can select grounded source turns for a multi-event projection, while code verifies the selection and performs the arithmetic.

## Work Completed

- Added [turn-context.ts](../../src/agent/turn-context.ts) to collect recent recurring costs with source-turn indices and conservative read-only/repeat hints.
- Added an advisory [context-reference resolver](../../src/agent/context-reference-resolver.ts), wired through [agent composition](../../src/app/create-victoria-agent.ts) and the [local chat runtime](../../src/app/http/create-local-mock-victoria-runtime.ts). Its model output has no action authority; source IDs, confidence, and cents arithmetic are checked in code.
- Used the context in [VictoriaAgent](../../src/agent/victoria-agent.ts) for combined projections, advice after a decline, and repeated-event clarification. A clearly new occurrence still follows the normal separate approval flow.
- Added [builder tests](../../tests/unit/agent/turn-context.test.ts), [resolver tests](../../tests/unit/agent/context-reference-resolver.test.ts), and [agent behavior tests](../../tests/unit/agent/victoria-agent.test.ts). Updated [MVP scope](../mvp.md), [Story 24](../user-stories.md), [safety contract](../specification/mvp-safety-contract.md), and [test plan](../../tests/test-plan.md).

## Decisions

- Language understanding may select among grounded context events, but it cannot approve an action, invent an event, or calculate the authoritative monetary total.
- Transcript-derived completion hints may trigger a clarification; only a trusted recent entry can support a definite “already recorded” claim.
- When “both” has more than two plausible source costs and no validated selection, Victoria asks which costs the user means.

## Verification

- `npm run check` passed: 69 test files and 642 tests passed; 15 skipped, 9 todo. Lint retained one pre-existing unused-variable warning in `memory-orchestrator.test.ts`; SQLite emitted experimental-feature warnings.
- Live OpenAI replay answered the $35/month buffer question after a refusal, combined separate $35/month and $20/month costs into a conditional $660/year projection without recording either, and stopped a paraphrased $6 coffee request. The mocked weekly total remained $6 after that request. No real money moved.
- `git diff --check` passed. Prior uncommitted work and the existing local server were preserved.

## Unresolved

- The first builder derives events from the recent conversation window. Durable, user-scoped event identity and authoritative completed-entry lookup across longer conversations or worker restarts remain to be built.
- General read-only advice still has narrow deterministic fallback wording. A future conversational reply layer can use the model for broader advice while retaining grounded facts and mutation guards.
- Provider reference selection is advisory and may fail or be uncertain; the safe fallback asks or uses an unambiguous deterministic two-event calculation.

## Recommended Next Step

- Persist scoped event identity and ledger links, then extend reference resolution to corrections, newer occurrences, and advice turns without deriving completion from transcript wording.
