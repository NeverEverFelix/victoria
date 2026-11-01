# Session: Explicit amount recovery in mixed turns

- Date: 2026-10-28
- Time: 12:55 EDT
- Status: Completed; broader conversational-review findings remain partial
- Scope: Diagnosed and fixed a mixed-turn repeat-amount clarification using a local live challenge.

## Outcome

When Financial Moment identified an avoided purchase and extracted its explicit amount but still marked clarification needed, Victoria could ask the user to repeat the amount and omit the separate personal question. A narrow evidence-grounding rule now clears that mismatch only when an explicit avoided-purchase phrase, a single valid USD amount, and any specialist-provided amount agree within the same sentence. Savings Reasoning and the normal exact-confirmation gate remain in place.

## Work Completed

- Added `groundExplicitAvoidedSpendAmount` in [team assessment policy](../../src/agent/team-assessment-policy.ts) and applied it to validated specialist and direct classifications.
- The rule only grounds a clearly stated skipped/avoided purchase. Multiple, malformed, unsupported-currency, or mismatched amounts do not pass through it.
- Kept the previously added guarded response normalization that changes “saved you $24” to “avoided spending $24” for a validated avoided-spend suggestion.
- Added agent regression coverage for a mixed turn whose specialist supplied `$24` but set `needsClarification: true`, while Savings Reasoning asked to repeat it. The test confirms one pending suggestion, both-topic response, one confirmation question, and no entry before approval.
- Updated the [deep-dive review](../VICTORIA_CONVERSATIONAL_CORE_DEEP_DIVE.md) and [test plan](../test-plan.md). The prior 12:48 session note remains an accurate record of the first failed live run; this entry records the later correction and successful rerun.

## Decisions

- An explicit amount may be grounded only when the classifier already identifies an avoided-spend event and the same sentence contains clear purchase-avoidance evidence.
- The fallback cannot approve, create, or move money. The user still must explicitly confirm the exact pending mocked-ledger entry.
- Broader multi-intent routing remains partial; this one path does not close F1.

## Verification

- `npm run check`: passed; 89 test files passed, 9 skipped; 829 tests passed, 25 skipped, 9 todo.
- Existing ESLint warning remains at `tests/unit/agent/memory-orchestrator.test.ts:146` for `_observedThrough`; Node emitted experimental SQLite warnings.
- `git diff --check`: passed.
- Fresh local CLI run with `DATABASE_URL=''`: the alternate “skipped a $24 takeout order” phrasing produced both a flexible Sunday-cooking answer and one exact `$24` ledger-confirmation question. “That sounds good, I guess” left the entry pending and requested clear yes/no. A separate live turn had already verified one explicit exact confirmation records one mocked `$24` entry. No real money moved.
- The worktree contains extensive pre-existing uncommitted and untracked work. No unrelated changes were reverted.

## Unresolved

- The live wording and output still need broader variation testing; one provider run cannot establish consistency.
- The review still has nine partial findings and two open findings; none is fully closed.

## Recommended Next Step

Continue mixed-turn evaluation with regretful spend and ambiguous intent, ensuring Victoria answers the human question without proposing avoided-spend savings or persisting a ledger entry.
