# Session: Validate Financial Moment Reference Hints

- Date: 2026-10-26
- Time: 10:33 EDT
- Status: Completed
- Scope: Add a typed Financial Moment fact-reference hint and validate it against the bounded context before passing it downstream.

## Outcome

Financial Moment can now return a fact ID and period when it recognizes a reference to supplied financial context. The OpenAI adapter drops hints that do not match an exact supplied fact. Runtime team validation resolves valid hints into a provenance-bearing fact and removes the raw model hint before passing the finding to Savings Reasoning. The hint does not supply a proposal amount or approve an action.

## Work Completed

- Added the `referenceHint` classification field and required nullable fact-ID/period fields in Financial Moment's strict provider schema.
- Added `resolveFinancialReferenceHint` to [conversation-context-builder.ts](../../src/agent/conversation-context-builder.ts), checking exact fact ID, period, USD currency, and safe positive cents.
- Updated [team-assessment-policy.ts](../../src/agent/team-assessment-policy.ts) to remove the raw model hint and attach only the resolved fact to the specialist finding.
- Passed resolved facts to Savings Reasoning and updated Financial Moment prompt metadata to v3.
- Added coverage for valid references, amount non-propagation, and rejection of fact IDs absent from context.
- Updated the architecture ADR, work queue, agent README, and test plan.

## Decisions

- Model output may nominate a supplied fact by ID and period. Application code verifies membership and derives the fact from its own context object.
- A resolved annual projection remains a conditional projection; it is not a recordable savings amount or approval signal.
- Proposal revision, amount selection for a savings entry, exact-action confirmation, and ledger writes remain deterministic runtime responsibilities.

## Verification

- Focused Financial Moment and specialist tests — passed.
- `npm run check` — passed: 73 test files passed, 8 skipped; 664 tests passed, 19 skipped, 9 todo.
- `git diff --check` — passed before this history entry was added.
- Existing lint warning remains in `tests/unit/agent/memory-orchestrator.test.ts` (`_observedThrough` unused); lint reports zero errors.
- Test runs emitted the existing experimental SQLite warning.

## Unresolved

- The resolved fact informs Savings Reasoning but is not yet an input to a general workflow-state manager or reusable reference-resolution subsystem.
- Durable selected-memory context, durable event identity, and broader reference-based pending-action revision remain open.
- The worktree contains earlier conversation architecture, planning-reference, and context-handoff changes; preserve them when continuing.

## Recommended Next Step

- Use a single end-to-end conversation test to decide whether the validated fact reference should drive a narrowly scoped deterministic pending-workflow response, without changing proposal or approval semantics.
