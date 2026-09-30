# Session: Savings Domain Boundaries And Agent Session History

- Date: 2026-09-30
- Time: 14:32 EDT
- Status: Completed
- Scope: Clarify Victoria's core savings domain objects, add initial type boundaries, and establish immutable financial history as a product invariant.

## Outcome

The session separated a reported savings moment from Victoria's estimate, the user-facing proposal, explicit approval, and the mocked ledger result. It also established that Victoria may learn and improve for each user without rewriting the historical records behind earlier decisions.

## Work Completed

- Refined the savings domain contracts in `src/domain/savings/types.ts`:
  - `SavingsEvent` represents the financial moment reported by the user.
  - `SavingsSuggestion` represents Victoria's estimate and retains its own identity.
  - `SavingsApproval` records authorization tied to a proposal, user, and action.
  - `SavingsProposal` uses a discriminated union for `pending`, `declined`, and `recorded` states.
  - MVP proposals cannot represent real transfers.
- Added compile-time contract checks in `tests/type-contracts/savings.ts` for invalid proposal states and real-transfer proposals.
- Added the immutable-history decision to the product specification, user stories, work queue, failure modes, test plan, repository instructions, and coding-agent workflow.
- Reframed the former edit/delete question as an append-only correction and reversal design question in `docs/decisions.md`.
- Added the append-only `docs/session-history/` workflow, integrated it into agent instructions and handoffs, and added an executable setup-validation test for its required instructions.

## Decisions

- Confirmed: Victoria's memory evolves, but historical events, suggestions, approvals, and ledger entries remain immutable.
- Confirmed: Revised estimates create new suggestions rather than changing prior suggestions.
- Confirmed: Corrections, reversals, and superseding actions must use new records linked to the originals.
- Confirmed: `SavingsSuggestion` deserves an independent identity because it must be user-specific, retrievable, and auditable over time.
- Confirmed: The MVP remains a mocked savings ledger and must not represent proposals as real transfers.

## Verification

- `npm run check` passed.
- All 12 test files and 70 tests passed.
- Three pre-existing lint warnings remain in `src/agent/memory/mock-memory.ts` and `tests/unit/agent/policy.test.ts`.

## Unresolved

- `SavingsProposal` currently embeds a `SavingsSuggestion`; the agreed direction is to reference the independently meaningful suggestion by `suggestionId`.
- `SavingsSuggestion` still needs user ownership, event linkage, estimate confidence, evidence, and creation metadata to support the agreed audit boundary.
- `SavingsEntry` still carries the older broad lifecycle, including pending/cancelled states and the future-facing movement mode.
- The agent does not yet create or persist the new event, suggestion, proposal, or approval records.
- Runtime immutability and append-only correction behavior are not implemented yet.
- The worktree contained pre-existing uncommitted domain and agent changes. Future agents must inspect `git status` and preserve unrelated work.

## Recommended Next Step

- Complete the domain contracts without changing runtime behavior: make `SavingsProposal` reference `suggestionId`, add the missing audit fields to `SavingsSuggestion`, and tighten `SavingsEntry` into an approved mocked-ledger record. Update type-contract checks, then run `npm run check`.
