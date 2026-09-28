# Victoria Decisions

This document records product and technical decisions that shape Victoria.

Use it to keep future development honest. If a coding agent runs into an unresolved product question, it should add the question here or ask the user instead of inventing a major behavior.

## Decided

### MVP Uses A Mocked Savings Ledger

Decision:

The MVP records savings in an internal mocked ledger. It does not move real money.

Why:

The first version needs to prove the behavioral loop before adding banking risk. Users should be able to practice noticing, confirming, and tracking saved money without Victoria needing production bank access.

Implications:

- Victoria can create mocked ledger entries after confirmation.
- Victoria must not claim money was transferred.
- Victoria must clearly explain when savings are only recorded.
- Real transfers remain out of scope for the MVP.

### One-Bank-Account Users Are Supported

Decision:

Victoria should support users who only have one bank account.

Why:

The first user may not have multiple accounts, a separate savings account, or a clean financial setup. Requiring multiple accounts would make the product less approachable.

Implications:

- Saved money may start as a mental and visible separation, not a physical transfer.
- The ledger should help users see what they intended to protect.
- Future versions may add vaults, savings accounts, or transfer integrations.

### Confirmation Is Required Before Recording Savings

Decision:

Victoria must ask for user confirmation before creating a savings ledger entry.

Why:

Saving suggestions involve money-related behavior and should remain user-controlled, even when the action is mocked.

Implications:

- An avoided-spend message can create a pending suggestion.
- A confirmed suggestion can create a mocked ledger entry.
- Approval must match the exact pending action and user, and it cannot be replayed after completion.
- Ambiguous replies must not be treated as approval.
- Declines should be respected without pressure.

### Regretful Spending Is Not Treated As Saved Money

Decision:

Regretful-spend messages should lead to reflection or planning, not automatic savings suggestions.

Why:

The product should avoid shame and should not turn regret into false progress.

Implications:

- "I regret ordering takeout" should not create a savings entry by default.
- Victoria can offer a plan, reminder, or reflection.
- If the user explicitly wants to save an amount after a regretful spend, Victoria should ask for the amount and confirmation.

### Real Money Movement Is Out Of Scope For MVP

Decision:

The MVP must not initiate bank transfers or wire production Plaid behavior.

Why:

Real money movement requires stronger approvals, auditing, idempotency, error handling, provider contracts, and production safety checks.

Implications:

- `eventuallyMoveMoney` should remain blocked or unused in MVP flows.
- Plaid production access should not be added yet.
- Any future real transfer work needs explicit approval and new tests.

## Open Questions

### What Makes Saved Money Feel Protected With One Account?

Question:

If the user has only one bank account, what should make Victoria savings feel meaningfully separate?

Possible answers:

- A visible ledger only.
- A savings goal balance inside Victoria.
- A warning when the user logs spending that conflicts with recent saved amounts.
- A future transfer to a separate account once banking is connected.

Current default:

Use a visible mocked ledger and honest language.

### Should Goals Exist From Day One?

Question:

Should users choose a savings goal in the MVP, or should Victoria start with a generic savings ledger?

Possible answers:

- Start with a generic ledger only.
- Include one default goal, such as emergency fund.
- Let users create simple named goals.

Current default:

Support optional goal language in contracts, but do not make goals required for the first loop.

### Can Users Edit Or Delete Saved Entries?

Question:

Should users be able to correct, delete, or undo mocked savings entries?

Possible answers:

- Yes, because early entries are user-controlled records.
- Not in the first implementation slice.
- Only allow canceling pending suggestions, not editing confirmed entries.

Current default:

Support declining pending suggestions first. Defer edit/delete behavior.

### How Should Victoria Handle Saved Money That Gets Spent Later?

Question:

If the user records money as saved but later spends it, how should Victoria respond?

Possible answers:

- Treat the ledger as intention tracking only.
- Let the user mark entries as spent.
- Reflect without shame and help reset.
- Eventually compare ledger entries with bank balances.

Current default:

Do not solve this in the MVP. Keep the ledger honest about being a record, not a guarantee.

### What Should Regretful Spending Create?

Question:

When a user regrets spending, should Victoria create a reflection note, a reminder, a suggested plan, or nothing persistent?

Possible answers:

- No persistence in the MVP.
- Store a reflection note.
- Schedule a reminder for similar future situations.
- Convert repeated regret into a habit insight.

Current default:

Respond conversationally without creating a ledger entry. Defer persistence.

### What Language Makes Mocked Savings Feel Honest?

Question:

How should Victoria describe mocked savings so users understand the value without being misled?

Possible answers:

- "I recorded this in your Victoria savings ledger."
- "No real money has moved yet."
- "This is tracked as saved, not transferred."
- "Want to protect this amount by moving it later?"

Current default:

Use direct language: "I recorded this in your Victoria savings ledger. No real money has moved yet."

## Decision Process

When adding or changing a decision:

1. State the decision plainly.
2. Explain why it was chosen.
3. List implementation implications.
4. Update related docs if needed.
5. Add or update tests when the decision affects behavior.

Related docs:

- `docs/mvp.md`
- `docs/user-stories.md`
- `docs/agent-work-queue.md`
- `tests/test-plan.md`
- `docs/environments.md`
