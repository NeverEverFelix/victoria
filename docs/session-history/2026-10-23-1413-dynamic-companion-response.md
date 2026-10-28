# Session: Dynamic Companion Response And Clarification Context

- Date: 2026-10-23
- Time: 14:13 America/New_York
- Status: Completed
- Scope: Remove the scripted employer-covered-expense response, pass validated context to Companion Voice, and keep direct amount answers attached to their pending clarification.

## Outcome

Employer-covered-expense responses now use the provider-backed Companion Voice rather than a fixed basketball-specific sentence. The voice receives saved interests and a validated annual projection as context. A bare amount answer to an outstanding amount question resolves that question before provider intent classification, preventing it from being mistaken for a ledger correction.

## Work Completed

- Removed the hardcoded employer-covered response and the special routing that bypassed model voice output.
- Extended [FinancialMomentFinding](../../src/agent/team-prototype.ts) with validated response context for saved interests and annual projections. [Companion Voice instructions](../../src/agent/team/openai-specialists.ts) now ask for grounded, natural wording and allow only supplied validated amounts.
- Kept monthly-to-yearly math in [domain money logic](../../src/domain/money.ts); it is passed to the voice model as validated context rather than calculated by the model or exposed as an action tool.
- Moved pending amount clarification resolution ahead of model classification in [victoria-agent.ts](../../src/agent/victoria-agent.ts). A concise amount reply resumes the pending financial event directly.
- Added regression coverage for dynamic response context and the `$35` follow-up that was previously misclassified as an entry correction.

## Decisions

- Confirmed: financial response wording is model-generated in provider mode and grounded in current message, saved interest, and validated projections. Mock/degraded mode may still use deterministic fallback wording.
- Confirmed: model wording cannot change the proposed amount, authorize a ledger write, or move money; exact approval remains required.
- Confirmed: simple monthly/yearly calculations remain deterministic domain logic rather than a model tool.

## Verification

- `npm run check` — passed: agent setup validation, lint, type checks, and 65 test files passed; 7 skipped; 561 tests passed, 15 skipped, 9 todo.
- Existing lint warning in `tests/unit/agent/memory-orchestrator.test.ts:112` and Node SQLite experimental warnings remain.
- `git diff --check` — passed.

## Unresolved

- A live CLI rerun remains useful to evaluate the model's actual tone and memory phrasing after these changes.
- Existing unrelated working-tree changes were present before this work and were left intact.

## Recommended Next Step

- Retry the basketball conversation in the provider-backed CLI and then reply `$35`; confirm the first response is warm and contextual, and the second response proposes the amount rather than asking about a correction.
