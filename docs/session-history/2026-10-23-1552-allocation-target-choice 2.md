# Session: Ask for a monthly or annual allocation target

- Date: 2026-10-23
- Time: 15:52 America/New_York
- Status: Completed
- Scope: Clarify the covered-gym conversation so Victoria asks whether the user wants the monthly amount or annual projection as an allocation target.

## Outcome

Victoria now asks one direct first-turn question about the allocation target: monthly amount or conditional annual projection. A follow-up selecting the annual target acknowledges it, explains that it builds from the monthly amount, and asks only about a one-time current-month ledger entry. The annual projection remains planning-only.

## Work Completed

- Reframed [the Companion Voice prompt](../../src/agent/team/openai-specialists.ts) to ask for the monthly-versus-annual allocation target without introducing a separate destination choice or ledger confirmation on the first turn.
- Renamed the typed first-turn context flag to `awaitingAllocationTargetChoice` and kept deterministic response policy aligned with that flow in [the agent contracts](../../src/agent/team-prototype.ts), [response policy](../../src/agent/team-response-policy.ts), and [Victoria's orchestration](../../src/agent/victoria-agent.ts).
- Reworked the personalized follow-up instructions to stay concise and continuous, use supplied values rather than hardcoded amounts, and preserve the annual projection as a target rather than a recordable ledger amount. Raised the safe reply limit to 1,500 characters so a longer valid model answer is not discarded by the previous 900-character cap.
- Updated [MVP expectations](../../docs/mvp.md), [the behavior test plan](../../tests/test-plan.md), and unit tests.

## Decisions

- “Allocation target” means the monthly amount or annual projection the user wants to plan around. It does not authorize a transfer or make an annual projection actual savings.
- The only supported ledger write remains a one-time current-month amount after explicit confirmation.
- Voice text remains model-generated; structured context carries the allocation-choice state and validated amounts.

## Verification

- Replayed the full two-turn OpenAI-backed chat over the already-running local server because its `next dev` process owned the standard port. Victoria asked which allocation target to use, then accepted “annual” as the target, explained it was a conditional projection, and asked whether to record this month’s amount. No ledger entry was confirmed or created.
- `npm run check` passed: 65 test files passed, 7 skipped; 561 tests passed, 15 skipped, and 9 todo.
- Lint reported two existing unused-variable warnings. SQLite experimental-feature warnings remain.
- The existing local server on port 3210 was left running because it was owned by the user's active session.

## Unresolved

- Provider response time still varies; the tested two-turn conversation took approximately 8.3 seconds per request.
- The worktree contains extensive earlier uncommitted changes; they were preserved.

## Recommended Next Step

Review the allocation-target wording in a few live conversations with different monthly amounts and hobbies, then evaluate the voice quality across those examples.
