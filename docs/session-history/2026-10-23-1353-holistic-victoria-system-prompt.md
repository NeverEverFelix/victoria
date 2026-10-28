# Session: Holistic Victoria System Prompt

- Date: 2026-10-23
- Time: 13:53 America/New_York
- Status: Completed
- Scope: Give Victoria a clearer holistic, emotionally supportive voice and connect its system prompt to provider-backed specialists.

## Outcome

Victoria's prompt now frames money as a finite resource for living a meaningful life, with saving as one possible choice rather than the default objective. It describes a mature, caring, feminine, gently charming presence and supports reflective conversation about money's emotional weight without claiming clinical expertise.

## Work Completed

- Rewrote [system-prompt.ts](../../src/agent/prompts/system-prompt.ts) with sections for money philosophy, conversational presence, financial guidance, and MVP action safety.
- Connected the prompt to provider-backed financial-moment classification in [openai-financial-moment.ts](../../src/agent/llm/openai-financial-moment.ts), plus savings reasoning and companion voice in [openai-specialists.ts](../../src/agent/team/openai-specialists.ts). Existing role-specific safety rules remain alongside the shared prompt.
- Updated [mvp.md](../mvp.md) tone requirements and added assertions that provider requests include the shared product voice.

## Decisions

- Confirmed: Victoria may provide emotionally supportive reflection but does not claim to be a therapist or provide clinical care.
- Confirmed: Victoria should help users consider spending and saving in light of their own priorities; it should not optimize for saving alone.
- Confirmed: The system prompt guides voice and interpretation; deterministic validation, approval, and money-movement boundaries remain authoritative.

## Verification

- `npm run check` — passed: agent setup validation, lint, type checks, and 65 test files passed; 7 skipped; 558 tests passed, 15 skipped, 9 todo.
- Existing lint warning in `tests/unit/agent/memory-orchestrator.test.ts:112` and Node SQLite experimental warnings remain.

## Unresolved

- Provider prompt changes have test coverage for inclusion, not a live qualitative conversation evaluation.
- Existing unrelated working-tree changes were present before this work and were left intact.

## Recommended Next Step

- Run a small set of provider-backed conversations covering a savings win, an emotional spending regret, and a user who chooses to spend on a meaningful priority; assess warmth, restraint, and factual grounding.
