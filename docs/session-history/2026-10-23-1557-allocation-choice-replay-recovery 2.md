# Session: Recover long annual reply and test allocation-target choice

- Date: 2026-10-23
- Time: 15:57 America/New_York
- Status: Completed
- Scope: Address a pasted CLI run where the annual follow-up exceeded the personalizer limit and the first response asked for an unrelated destination choice.

## Outcome

The first response now asks which validated amount the user wants as an allocation target: monthly or annual. The annual follow-up uses the selected projection, explains its monthly basis, and asks only for explicit approval to record the current month's amount. Longer but valid personalized replies no longer fail at the previous 900-character cap.

## Work Completed

- Reworked [the Companion Voice instructions](../../src/agent/team/openai-specialists.ts) to ask one allocation-target question and avoid a separate destination menu before the user chooses a target.
- Added typed `awaitingAllocationTargetChoice` context so response policy defers the ledger confirmation during that first choice turn. The target selection does not authorize ledger writes or real transfers.
- Simplified and shortened [personalized-reply instructions](../../src/agent/memory/openai-personalized-reply.ts), made amounts refer to supplied validated context, and raised the provider and validator reply-length ceiling to 1,500 characters.
- Updated the MVP behavior contract and tests in [docs/mvp.md](../../docs/mvp.md), [tests/test-plan.md](../../tests/test-plan.md), and the corresponding agent unit tests.

## Decisions

- The user's “allocate monthly or yearly” choice is an allocation target for planning. The annual projection remains conditional and cannot be recorded as already saved.
- A mocked ledger entry remains one current-month amount and requires explicit confirmation.
- Provider-generated wording remains dynamic; the structured flag only controls when confirmation is appropriate.

## Verification

- Replayed two turns through the already-running local server using a unique conversation ID. Victoria asked which target to use, then accepted the annual target and asked about a one-time current-month ledger entry. Neither response created a ledger entry.
- The annual follow-up completed personalization rather than logging the prior `too_big` rejection and generic fallback.
- `npm run check` passed: 65 test files passed, 7 skipped; 561 tests passed, 15 skipped, and 9 todo.
- `git diff --check` passed. Lint reported two existing unused-variable warnings; SQLite experimental-feature warnings remain.
- The local server on port 3210 belonged to the user's active CLI session and was left running.
- The worktree contains extensive earlier uncommitted changes; they were preserved.

## Unresolved

- Provider response time remains variable, at approximately 8.3 seconds per turn in this replay.

## Recommended Next Step

Review the generated wording across a few monthly/annual target conversations with different amounts and interests, while keeping the projection and actual ledger amount distinct.
