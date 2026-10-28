# Session: Relax false rejections in companion voice guard

- Date: 2026-10-23
- Time: 15:07 America/New_York
- Status: Partial
- Scope: Correct guard rules that can reject natural budgeting language and replace it with the generic savings-ledger fallback.

## Outcome

The Companion Voice validator now accepts a user-directed budgeting suggestion as distinct from Victoria claiming she can execute a transfer. Memory-interest validation matches a meaningful topic word rather than requiring the model to repeat an entire extracted phrase, and amount validation recognizes both currency-symbol and “dollars” formats.

These are identified false-rejection paths consistent with the reported generic output; the precise cause for the supplied run is not yet observable because the CLI does not report voice-validation rejection reasons.

## Work Completed

- Narrowed the claimed-money-movement check and improved validated amount and memory-interest matching in [the companion response policy](../../src/agent/team-response-policy.ts).
- The prior session's provider revision retry and expanded voice instructions remain in [the agent](../../src/agent/victoria-agent.ts) and [OpenAI specialists](../../src/agent/team/openai-specialists.ts).

## Decisions

- Advice about how a user may budget their own money is allowed; Victoria must not claim that she can or did move funds.
- Real money movement remains outside the MVP.

## Verification

- `git diff --check` passed.
- No tests or CLI replay were run.

## Unresolved

- The original CLI scenario has not been replayed after this adjustment.
- The exact rejected-draft reason for the user's run remains unconfirmed; adding privacy-safe rejection-reason telemetry would make future regressions diagnosable.
- The worktree contains extensive unrelated and earlier in-progress changes; they were preserved.

## Recommended Next Step

Replay the original gym prompt. If the generic fallback remains, capture a safe rejection category (such as missing validated amount, memory reference, prohibited capability claim, or completed-action claim) without logging private conversation text, then correct that specific path.
