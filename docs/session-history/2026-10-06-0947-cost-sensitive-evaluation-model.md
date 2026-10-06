# Session: Cost-Sensitive Evaluation Model

- Date: 2026-10-06
- Time: 09:47 EDT
- Status: Partial
- Scope: Select a cost-sensitive model for the Financial Moment provider smoke evaluation.

## Outcome

GPT-6 Luna is the selected default for the initial provider evaluation because it is listed for cost-sensitive, high-volume tasks and supports Responses and Structured Outputs. Its current listed standard rates are $0.10 per million input tokens and $0.50 per million output tokens; rates may change. The optional evaluation harness now defaults to this model unless `OPENAI_EVAL_MODEL` overrides it.

## Work Completed

- Changed the provider smoke evaluation default to `gpt-6-luna` in [evaluation test](../../tests/evaluation/provider-financial-moment.test.ts).
- Updated [evaluation instructions](../../tests/evaluation/README.md) with model choice, current listed token rates, and run requirements.
- Updated the provider readiness checklist to record the evaluation model decision while leaving production model selection pending measured results.

## Decisions

- Confirmed: GPT-6 Luna is the default model for the initial Financial Moment evaluation.
- Confirmed: this does not enable the provider in the production composition; `OPENAI_FINANCIAL_MOMENT_ENABLED` remains default-off.
- Production model selection remains open until provider results are reviewed.

## Verification

- Current OpenAI API documentation identifies GPT-6 Luna as a cost-sensitive, high-volume model and lists Responses and Structured Outputs support; the model page lists current token pricing.
- Live evaluation was not run because `OPENAI_API_KEY` is absent from the process environment and `.env.local` is not present.
- `npm run check` passed: agent setup validation, lint, both TypeScript checks, and 249 tests passed, 1 skipped, 1 todo.
- `git diff --check` passed.

## Unresolved

- The seven-case provider evaluation still needs an API key and results review.
- The model comparison, 50-case corpus, blinded review, and cost estimate remain outstanding readiness work.

## Recommended Next Step

Provide `OPENAI_API_KEY` to the shell environment and run `npm run eval:provider:financial-moment`; then review classification, amount, and latency results before choosing any production model.
