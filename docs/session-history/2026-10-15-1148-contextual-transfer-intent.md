# Session: Classify transfer intent from context

- Date: 2026-10-15
- Time: 11:48 America/New_York
- Status: Completed
- Scope: Replace the phrase-specific “move over” transfer shortcut with context-aware intent classification.

## Outcome

Victoria no longer classifies “move over” as a real-money transfer solely because those words appear. The provider-backed financial-moment classifier receives the current message and recent conversation with instructions to distinguish actual transfers from mock-ledger requests and ask when intent is ambiguous. The local mock classifier stays conservative for unsupported ambiguity.

## Work Completed

- Removed the unconditional “move over” transfer match from [`mock-llm.ts`](../../src/agent/llm/mock-llm.ts).
- Updated the provider classifier guidance in [`openai-financial-moment.ts`](../../src/agent/llm/openai-financial-moment.ts) to use full meaning and context rather than keyword matching.
- Added tests for ambiguous local mock behavior and for forwarding context to the provider classifier in [`victoria-agent.test.ts`](../../tests/unit/agent/victoria-agent.test.ts) and [`openai-financial-moment.test.ts`](../../tests/unit/agent/openai-financial-moment.test.ts).
- Updated [`test-plan.md`](../../tests/test-plan.md).

## Decisions

- Confirmed: colloquial wording alone does not establish real-money movement intent. Classify the user's request from meaning and recent conversation; ask when unclear.
- Correction: the immediately preceding session entry [`2026-10-15-1147-move-over-request-context.md`](2026-10-15-1147-move-over-request-context.md) described a phrase-specific shortcut that has now been removed.

## Verification

- `npm run check` passed: agent validation, lint, TypeScript checks, and tests (409 passed, 4 skipped, 9 todo; 6 test files skipped).
- No live provider calls were made; provider behavior was tested through a mocked fetcher.

## Unresolved

- The provider classifier's judgment quality on colloquial requests still needs offline evaluation against contextual examples; no live model call was made.

## Recommended Next Step

Add paired offline evaluation examples where identical colloquial words mean a mock-ledger request in one context and real money movement in another, then verify the provider classification and safety response remain distinct.
