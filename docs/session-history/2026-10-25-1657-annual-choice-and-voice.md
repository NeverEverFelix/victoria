# Session: Annual choice recovery and Victoria voice

- Date: 2026-10-25
- Time: 16:57 EDT
- Status: Completed
- Scope: Address the reported basketball and employer-covered gym conversation, annual-choice loop, and memory extraction timeout.

## Outcome

Victoria now carries an annual planning choice across an intervening math question and a durable proposal restore. Repeating the annual request after a monthly ledger offer closes that offer and clarifies whether the annual amount is already set aside or only a future target. The provider voice instructions now ask for an attentive, warm response grounded in the user's stated activity and circumstances.

## Work Completed

- Adjusted the optional [memory extractor](../../src/agent/memory/openai-conversational-memory-extractor.ts) to use low reasoning effort and a longer timeout after reproducing an eight-second timeout on the reported gym scenario.
- Updated [annual choice recovery and follow-up](../../src/agent/victoria-agent.ts) so an intervening projection question does not hide a later choice and a repeated yearly request cannot be mistaken for approval of the monthly entry.
- Refined the [specialist voice](../../src/agent/team/openai-specialists.ts) and [read-only conversation voice](../../src/agent/conversation-responder.ts) to acknowledge the user's situation and avoid generic financial menus while preserving financial boundaries.
- Added regression coverage in [agent tests](../../tests/unit/agent/victoria-agent.test.ts) and a gated [provider smoke test](../../tests/evaluation/provider-conversation-live.test.ts). Updated [Story 22](../user-stories.md), [MVP behavior](../mvp.md), and the [test plan](../../tests/test-plan.md).

## Decisions

- Confirmed from the existing product contract: a conditional annual projection is a planning target, not a current mocked saving. A current-month entry still requires separate explicit confirmation. A repeated yearly request after the monthly offer closes that offer.
- Voice direction: Victoria should sound attentive, feminine, and practical, while making no claim about the user's feelings that the message does not support.

## Verification

- `RUN_PROVIDER_CONVERSATION_SMOKE=1 npx vitest run tests/evaluation/provider-conversation-live.test.ts`: passed, including memory extraction on the gym scenario.
- `npm run check`: passed; 649 tests passed. Existing lint warning in `tests/unit/agent/memory-orchestrator.test.ts` remains.
- Signed local API replay of the reported gym conversation: initial response gave $35 monthly and conditional $420 annual; annual choice persisted; repeated annual request produced a clarification rather than another $35 offer; a later bare “yes” did not create an entry.

## Unresolved

- The MVP has no persisted annual planning-target object. The $420 projection can be discussed, but only a current, explicitly approved saving can become a mocked ledger entry.
- Provider memory extraction can still fail transiently; Victoria continues the conversation without provider-derived memories when that happens.
- This working tree includes earlier uncommitted session changes; preserve them.

## Recommended Next Step

- Define and implement a separate planning-target record if users should be able to save annual targets without representing projected amounts as already saved.
