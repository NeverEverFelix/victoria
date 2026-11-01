# Session: Harden live planning and approval follow-ups

- Date: 2026-10-25
- Time: 16:09 EDT
- Status: Completed
- Scope: Repair live-chat failures in ended recurring-cost recognition, pending-proposal conversation flow, and immediate approval replay.

## Outcome

Victoria now recognizes common compact recurring-price wording, answers grounded read-only planning questions while a proposal is pending or after it is declined, honors a clear refusal followed by another request, and does not reopen an entry when the completed approval turn is repeated.

## Work Completed

- Grounded the stated period beside a USD price, including hyphenated and slash-separated forms, while retaining conservative cancellation and amount checks in [money intent](../../src/agent/money-movement-intent.ts).
- Recognized a standalone refusal at the start of a longer message in [approval policy](../../src/agent/policy.ts).
- Kept read-only projection and ordinary finance questions separate from pending approval, answered conditional annual math after decline, and guarded repeated completed approval turns using scoped conversation evidence in [the agent](../../src/agent/victoria-agent.ts).
- Added behavior coverage in [agent tests](../../tests/unit/agent/victoria-agent.test.ts) and [policy tests](../../tests/unit/agent/policy.test.ts); updated [MVP scope](../mvp.md), [Story 23](../user-stories.md), [safety rules](../specification/mvp-safety-contract.md), and [test plan](../../tests/test-plan.md).

## Decisions

- A read-only question cannot approve or replace a pending mocked-ledger proposal. A clear refusal takes effect before a separate planning question is answered.
- A repeated completed approval turn in the same conversation reports the existing entry, including after agent reconstruction from shared conversation history.
- Conditional annual projections remain planning information and are never recorded as a current monthly saving.

## Verification

- `npm run check` passed: 67 test files and 631 tests passed; 15 skipped, 9 todo. Lint retained one pre-existing unused-variable warning in `memory-orchestrator.test.ts`; SQLite emitted experimental-feature warnings.
- Live OpenAI replay on the existing local server recognized both `$35-a-month` and `$35/month`, answered $35/month as a conditional $420/year after refusal and after “maybe later,” and did not record either planning amount.
- A separate live replay recorded one explicitly approved $6 mocked coffee entry. Repeating the identical approval returned “already recorded”; the weekly mocked-ledger total remained $6. No real money moved.
- `git diff --check` passed. The existing local server was left running and earlier uncommitted work was preserved.

## Unresolved

- Changed-wording requests about a previously completed event can be indistinguishable from a genuinely new savings moment without stronger event identity; the current replay guard covers the immediately repeated completed approval turn, while action-ID idempotency still protects retries of the same proposal.
- Live provider wording varies; deterministic money and approval boundaries remain authoritative.

## Recommended Next Step

- Define an explicit user-facing way to distinguish a new occurrence from a paraphrase of a completed event, then add durable event-level duplicate checks without suppressing legitimate repeated savings moments.
