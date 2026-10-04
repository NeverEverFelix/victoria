# Victoria MVP Safety Contract

Status: Normative for the headless MVP

This specification turns Victoria's product boundaries into rules that can be traced to executable tests. It governs the mocked savings-ledger loop only. Real bank transfers, settlement, foreign-exchange conversion, and production-provider behavior are outside its scope.

If this specification conflicts with `docs/mvp.md` or `docs/user-stories.md`, use the narrower, safer behavior and repair the conflict before implementing the affected slice.

## Reading The Contract

The key words **MUST**, **MUST NOT**, **SHOULD**, and **MAY** are normative.

Each rule has a stable identifier:

- `FIN`: financial invariants.
- `ARC`: agent and deterministic-code responsibilities.
- `INT`: typed intents and proposals.
- `APR`: approval semantics.
- `STA`: state transitions.
- `AMT`: amount and currency rules.
- `IDM`: idempotency and retries.
- `COR`: corrections and immutable history.
- `ERR`: failure and ambiguity behavior.
- `AUD`: auditability and user-visible wording.

Rule status means:

- **Enforced**: an executable test exercises the current implementation.
- **Type-enforced**: TypeScript contract tests reject invalid representations.
- **Specified**: normative for its implementation slice, but not yet implemented.
- **Deferred**: deliberately non-normative for the MVP.

An implementation slice is not complete while one of its applicable rules remains only `Specified`.

## Shared Vocabulary

- **Event**: the immutable financial moment reported by the user.
- **Suggestion**: Victoria's amount and supporting rationale at a point in time.
- **Proposal**: a user-addressed offer to record one suggestion in the mocked ledger.
- **Approval**: the user's explicit authorization for one exact pending proposal.
- **Ledger entry**: the immutable record created after valid approval.
- **Correction**: a new linked record that changes the interpreted ledger effect without rewriting history.
- **Goal allocation**: a separately approved immutable record linking a completed savings entry to a named goal.
- **Mocked**: recorded inside Victoria; no bank funds were moved.

## 1. Financial Invariants

| ID      | Normative rule                                                                                                                                                                 | Status                               | Executable coverage                                                                      |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------------------------------------ | ---------------------------------------------------------------------------------------- |
| FIN-001 | During the MVP, Victoria **MUST NOT** initiate, represent, or imply real money movement.                                                                                       | Enforced                             | `tests/contracts/mvp-safety-contract.test.ts`; `tests/unit/agent/policy.test.ts`; `tests/unit/agent/victoria-agent.test.ts` |
| FIN-002 | A mocked ledger entry **MUST NOT** exist without a valid approval for its exact proposal, action, and user.                                                                    | Enforced in agent memory             | `tests/contracts/mvp-safety-contract.test.ts`; `tests/unit/agent/victoria-agent.test.ts` |
| FIN-003 | Only completed mocked ledger entries **MAY** contribute to reported savings totals. Pending, declined, cancelled, failed, or merely suggested amounts **MUST NOT** contribute. | Enforced                             | `tests/contracts/mvp-safety-contract.test.ts`; `tests/unit/domain/savings.test.ts`       |
| FIN-004 | Stored and calculated monetary amounts **MUST** use integer minor units. The MVP minor unit is the US cent.                                                                    | Specified                            | Planned domain validation tests                                                          |
| FIN-005 | An estimate **MUST NOT** be presented as a guaranteed saving, available balance, or completed transfer.                                                                        | Enforced for current suggestion flow | `tests/contracts/mvp-safety-contract.test.ts`                                            |

Examples:

- Valid: "I recorded $27.46 in your Victoria savings ledger. No real money has moved yet."
- Valid: a $27.46 proposal stores `2746` cents.
- Invalid: "I transferred $27.46 to savings."
- Invalid: including a pending $27 proposal in the weekly total.

## 2. Agent And Deterministic-Code Responsibilities

| ID      | Agent responsibility                                                                             | Deterministic-code responsibility                                                                                         | Status                           |
| ------- | ------------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------- | -------------------------------- |
| ARC-001 | Classify natural language and extract candidate intent, merchant, amount, goal, and uncertainty. | Validate that the resulting typed value is allowed before any state change.                                               | Enforced at the current boundary |
| ARC-002 | Propose helpful wording and supported estimates.                                                 | Own amount validation, currency rules, approval matching, state transitions, totals, idempotency, and tool authorization. | Specified; partially enforced    |
| ARC-003 | Ask for clarification when meaning is uncertain.                                                 | Prevent a clarification or reflection decision from carrying a state-mutating tool call.                                  | Enforced for current flows       |
| ARC-004 | Select a requested capability.                                                                   | Policy code **MUST** make the final allow/refuse decision for approval-gated or prohibited tools.                         | Enforced                         |

The model's confidence score is evidence for a decision; it is never authorization. A prompt instruction is not a substitute for a deterministic invariant.

Example: the agent may infer `avoided_spend` and extract `$90`; deterministic code must decide whether `9000` cents is valid and whether a matching approval permits ledger creation.

Counterexample: letting model output `{ approved: true }` directly create a ledger entry.

## 3. Typed Intents And Proposals

### Intent decision table

| User meaning                                    | Typed intent      | May create proposal immediately? | Required behavior                                 |
| ----------------------------------------------- | ----------------- | -------------------------------: | ------------------------------------------------- |
| Avoided purchase with supported amount          | `avoided_spend`   |                              Yes | Propose mocked recording; await approval          |
| Avoided purchase without supported amount       | `avoided_spend`   |                               No | Ask for amount or obtain supported habit estimate |
| "I saved money today" without context           | `unclear`         |                               No | Ask what changed and about how much               |
| Regretted completed spending                    | `regretful_spend` |                               No | Reflect or plan without calling it savings        |
| Clear goal allocation with unclear target entry | `goal_allocation` |                               No | Ask which saved amount is meant                   |

| ID      | Normative rule                                                                                                              | Status                                                         | Executable coverage                           |
| ------- | --------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------- | --------------------------------------------- |
| INT-001 | Every agent decision **MUST** contain one typed intent and one typed action.                                                | Enforced by types                                              | Agent typecheck and agent unit tests          |
| INT-002 | A savings proposal **MUST** identify its event, user, suggestion, mocked movement mode, creation time, and lifecycle state. | Type-enforced, except proposal currently embeds its suggestion | `tests/type-contracts/savings.ts`             |
| INT-003 | A regretful-spend or unclear intent **MUST NOT** create a savings proposal or ledger-writing tool call by default.          | Enforced                                                       | `tests/contracts/mvp-safety-contract.test.ts` |
| INT-004 | A proposal in the MVP **MUST NOT** use `real_transfer` movement mode.                                                       | Type-enforced                                                  | `tests/type-contracts/savings.ts`             |

## 4. Approval Semantics

Approval is capability-specific. It authorizes one proposed mocked-ledger action, not a general willingness to save and not any future action.

### Approval decision table

| Pending proposal | Same user | Exact action | Explicit approval | Prior completion | Result                                                 |
| ---------------: | --------: | -----------: | ----------------: | ---------------: | ------------------------------------------------------ |
|               No |         — |            — |               Yes |                — | Refuse; no mutation                                    |
|              Yes |        No |          Yes |               Yes |               No | Refuse; no mutation                                    |
|              Yes |       Yes |           No |               Yes |               No | Refuse; no mutation                                    |
|              Yes |       Yes |          Yes |   No or ambiguous |               No | Clarify; no mutation                                   |
|              Yes |       Yes |          Yes |               Yes |               No | Record exactly once                                    |
|              Yes |       Yes |          Yes |               Yes |              Yes | Return prior outcome or refuse replay; never duplicate |

| ID      | Normative rule                                                                                                                                     | Status                                  | Executable coverage                           |
| ------- | -------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------- | --------------------------------------------- |
| APR-001 | Ledger creation **MUST** require an existing pending proposal.                                                                                     | Enforced in agent memory                | `tests/unit/agent/victoria-agent.test.ts`     |
| APR-002 | Approval **MUST** bind to the exact user and action identifier.                                                                                    | Enforced in agent memory                | `tests/contracts/mvp-safety-contract.test.ts` |
| APR-003 | Only an explicit affirmative response in the proposal's conversational context **MAY** become an approval record. Ambiguous language **MUST NOT**. | Enforced for the current in-memory flow | `tests/unit/agent/victoria-agent.test.ts`     |
| APR-004 | Approval **MUST** be single-use.                                                                                                                   | Enforced within one agent process       | `tests/contracts/mvp-safety-contract.test.ts` |
| APR-005 | Changing a pending proposal's amount, reason, or goal **MUST** create a linked replacement proposal and require new approval. Currency remains USD, movement remains `mock_ledger`, and the target user remains bound to the authenticated request; unsupported changes **MUST NOT** reuse the old approval. | Enforced for supported in-memory flows | `tests/unit/agent/victoria-agent.test.ts` |
| APR-006 | Approval of a mocked ledger entry **MUST NOT** authorize a real transfer.                                                                          | Enforced                                | Policy tests                                  |
| APR-007 | Allocating a completed entry to a goal **MUST** create a new approval-bound record linked to that entry and **MUST NOT** mutate the original entry. | Enforced in mock agent flow             | `tests/unit/agent/victoria-agent.test.ts`; `tests/unit/agent/policy.test.ts` |

Positive examples: "Yes, record that $27" and "Record it" when exactly one proposal is pending.

Counterexamples requiring clarification or refusal: "maybe", "sure I guess", "that sounds nice", a bare "yes" with multiple plausible proposals, and approval supplied by another user.

## 5. State Transitions

```text
reported event
    -> suggestion
    -> pending proposal
         -> declined
         -> recorded -> mocked ledger entry
```

`declined` and `recorded` are terminal proposal states. A new user decision after either terminal state creates a new proposal rather than reopening the old one.

| Current state | Input                          | Next state                     | Side effect                            |
| ------------- | ------------------------------ | ------------------------------ | -------------------------------------- |
| No proposal   | Supported avoided-spend event  | Pending                        | Persist event, suggestion, proposal    |
| No proposal   | Ambiguous or unsupported event | None                           | Ask follow-up                          |
| Pending       | Valid approval                 | Recorded                       | Create exactly one mocked ledger entry |
| Pending       | Clear decline                  | Declined                       | No ledger entry                        |
| Pending       | Ambiguous response             | Pending                        | Clarify; no ledger entry               |
| Recorded      | Replayed approval              | Recorded                       | No new entry                           |
| Declined      | Later request to record        | Declined; new proposal pending | Preserve declined proposal             |

| ID      | Normative rule                                                                                                         | Status                            |
| ------- | ---------------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| STA-001 | Proposal transitions **MUST** follow the table above; impossible combinations **MUST** be unrepresentable or rejected. | Type-enforced for proposal shapes |
| STA-002 | A clarification, reflection, or refusal **MUST NOT** mutate financial state.                                           | Enforced for current flows        |
| STA-003 | Terminal proposals **MUST NOT** be changed back to pending.                                                            | Specified                         |

## 6. Amount Parsing, Rounding, And Currency

The MVP is USD-only. Supporting USD does not imply that unmarked numbers are dollars.

### Amount decision table

| Input              | Result                                              | Rationale                                |
| ------------------ | --------------------------------------------------- | ---------------------------------------- |
| `$90`              | `9000` cents                                        | Explicit supported currency marker       |
| `$6.75`            | `675` cents                                         | Exact two-decimal amount                 |
| `90 dollars`       | Ask/unsupported until parser support is implemented | Do not silently reinterpret              |
| `about $20`        | Candidate `2000` cents with approximate provenance  | Wording remains an estimate              |
| `$6.755`           | Ask for clarification                               | User-entered precision exceeds USD cents |
| `$20 or $30`       | Ask which amount                                    | Multiple plausible amounts               |
| `-$5`, `$0`, `$-5` | Reject for a savings proposal                       | Savings proposal must be positive        |
| `€20`              | Explain USD-only limitation or ask for a USD amount | No implicit FX conversion                |

| ID      | Normative rule                                                                                                                                                                                             | Status                          | Executable coverage                       |
| ------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- | ----------------------------------------- |
| AMT-001 | Persisted USD amounts **MUST** be positive, safe integers expressed in cents.                                                                                                                              | Enforced at the mocked ledger write boundary | `tests/contracts/mvp-safety-contract.test.ts` |
| AMT-002 | Explicit inputs with zero, negative value, excessive precision, unsupported currency, or multiple plausible amounts **MUST NOT** become a proposal without clarification.                                  | Enforced for zero/negative USD and multiple dollar amounts | `tests/unit/domain/financial-events.test.ts`; `tests/unit/agent/victoria-agent.test.ts`; precision/currency covered by AMT-004/005 |
| AMT-003 | Conversion from a trusted numeric calculation to cents **MUST** use one documented rounding rule. Current deterministic calculations use nearest cent, half toward positive infinity through `Math.round`. | Enforced for numeric conversion | `tests/unit/domain/money.test.ts`         |
| AMT-004 | User-entered amounts with more than two fractional digits **MUST NOT** be silently rounded.                                                                                                                | Enforced for explicit USD amounts | `tests/unit/agent/victoria-agent.test.ts`; `tests/unit/domain/financial-events.test.ts` |
| AMT-005 | The MVP **MUST NOT** perform currency conversion.                                                                                                                                                          | Enforced for recognized currency symbols | `tests/unit/agent/victoria-agent.test.ts` |
| AMT-006 | Formatting **MUST** show USD with exactly two fractional digits.                                                                                                                                           | Enforced                        | Money domain tests                        |
| AMT-007 | The currently supported explicit forms `$D` and `$D.CC` **MUST** parse to their exact cent value.                                                                                                          | Enforced                        | Contract and financial-event domain tests |

The distinction between `AMT-003` and `AMT-004` is deliberate: deterministic calculations may need rounding, but Victoria must not silently change an explicitly entered amount.

## 7. Idempotency And Retries

| Situation                                              | Required result                                              |
| ------------------------------------------------------ | ------------------------------------------------------------ |
| Same approval/action received twice                    | At most one ledger entry                                     |
| Client times out after successful creation and retries | Return/reconstruct the original outcome; do not duplicate    |
| Tool fails before persistence                          | Proposal remains pending and retryable                       |
| Persistence succeeds but response fails                | Retry finds the existing entry                               |
| Same text approves two distinct proposals              | Each requires its own action identifier and approval context |

| ID      | Normative rule                                                                                                        | Status                                 | Executable coverage                                              |
| ------- | --------------------------------------------------------------------------------------------------------------------- | -------------------------------------- | ---------------------------------------------------------------- |
| IDM-001 | Ledger creation **MUST** be idempotent on the approved action identifier, scoped to the user.                         | Enforced in the mock ledger; durable adapter enforcement remains future work | Replay scenarios in `tests/contracts/mvp-safety-contract.test.ts` and `tests/unit/agent/victoria-agent.test.ts` |
| IDM-002 | A retry **MUST NOT** create a new event, suggestion, approval, or ledger entry when the original operation committed. | Specified                              | Planned repository/integration tests                             |
| IDM-003 | A failed write **MUST NOT** be reported as recorded.                                                                  | Enforced for the current agent flow    | `tests/unit/agent/victoria-agent.test.ts`                        |
| IDM-004 | Durable adapters **MUST** enforce uniqueness rather than relying only on an in-memory pre-check.                      | Specified                              | Planned persistence contract tests                               |

Real-transfer idempotency and provider retry policies are deferred because real money movement is prohibited in the MVP.

## 8. Corrections And Immutable History

| ID      | Normative rule                                                                                        | Status                                        |
| ------- | ----------------------------------------------------------------------------------------------------- | --------------------------------------------- |
| COR-001 | Events, suggestions, proposals, approvals, and ledger entries **MUST** be append-only after creation. | Type direction established; runtime specified |
| COR-002 | New habits or evidence **MUST** affect only future suggestions.                                       | Specified                                     |
| COR-003 | A corrected amount **MUST** be represented by a new record linked to the record it corrects.          | Specified                                     |
| COR-004 | Audit views **MUST** retain both the original record and every linked correction.                     | Specified                                     |
| COR-005 | Totals **MUST** use the effective ledger impact after corrections without erasing original history.   | Specified; exact record shape unresolved      |

Example: an approved $27 entry later corrected to $24 retains the $27 entry and appends linked corrective history. The exact MVP correction record shape remains an open decision in `docs/decisions.md`; implementation must resolve that question before declaring correction behavior complete.

Counterexample: updating the original entry's `amountCents` from `2700` to `2400`.

## 9. Failure And Ambiguity Behavior

| Condition                                | User-visible behavior                                  |      Mutation allowed? |
| ---------------------------------------- | ------------------------------------------------------ | ---------------------: |
| Unclear event                            | Ask what was avoided or changed                        |                     No |
| Unknown amount and no supported estimate | Ask the typical amount                                 |                     No |
| Ambiguous approval                       | Ask for explicit confirmation                          |                     No |
| Approval mismatch                        | Refuse safely                                          |                     No |
| Regretful spend                          | Respond without shame; offer reflection or planning    |     No ledger mutation |
| Prohibited real-transfer request         | Explain mocked-ledger limitation                       | No real-money mutation |
| Tool failure                             | State that recording did not complete; keep retry safe |       No success claim |

| ID      | Normative rule                                                                                                                             | Status                                          | Executable coverage                           |
| ------- | ------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------- | --------------------------------------------- |
| ERR-001 | When intent, amount, target, or approval is materially ambiguous, Victoria **MUST** ask or refuse and **MUST NOT** mutate financial state. | Enforced for current unclear and mismatch flows | Contract and agent tests                      |
| ERR-002 | Regretful spend **MUST NOT** be reframed as saved money by default.                                                                        | Enforced                                        | `tests/contracts/mvp-safety-contract.test.ts` |
| ERR-003 | Tool or persistence failure **MUST NOT** produce success wording.                                                                          | Enforced for the current agent flow            | `tests/unit/agent/victoria-agent.test.ts`       |
| ERR-004 | A failure response **SHOULD** say what did not happen and give one safe next step without blame.                                           | Enforced for the current agent flow            | `tests/unit/agent/victoria-agent.test.ts`       |

## 10. Auditability And User-Visible Wording

Every recorded action must be reconstructable without relying on model memory or hidden reasoning.

| Record       | Minimum audit fields for the completed slice                                                         |
| ------------ | ---------------------------------------------------------------------------------------------------- |
| Event        | ID, user ID, raw/faithful summary, classified type, classification confidence, creation time         |
| Suggestion   | ID, event ID, user ID, amount cents, currency, evidence/source, reason, creation time                |
| Proposal     | ID, suggestion ID, user ID, movement mode, state, creation time                                      |
| Approval     | ID, proposal ID, user ID, action ID, source, approval time                                           |
| Ledger entry | ID, proposal/approval linkage, user ID, amount cents, currency, reason, mocked status, creation time |
| Correction   | ID, corrected-record ID, reason, effective change, creation time                                     |

| ID      | Normative rule                                                                                                                                                              | Status                                        | Executable coverage                                                                      |
| ------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------- |
| AUD-001 | A suggestion based on history or a default **MUST** use estimate language. A user-provided exact amount **SHOULD** say that Victoria is using the amount the user provided. | Enforced for current suggestion sources       | `tests/unit/agent/victoria-agent.test.ts`; `tests/contracts/mvp-safety-contract.test.ts` |
| AUD-002 | A successful mocked recording **MUST** say it was recorded in Victoria's savings ledger and that no real money moved.                                                       | Enforced                                      | `tests/contracts/mvp-safety-contract.test.ts`                                            |
| AUD-003 | User-visible text **MUST NOT** claim transfer, guaranteed protection, or bank-balance changes.                                                                              | Enforced for current recording flow           |
| AUD-004 | Financial mutations **MUST** be attributable to a user, proposal, approval/action, and timestamp.                                                                           | Type direction established; runtime specified |
| AUD-005 | User-facing explanations **MUST NOT** expose hidden chain-of-thought. They **SHOULD** state the concise evidence used, such as user-provided amount or merchant history.    | Specified                                     |

Required successful-recording meaning:

> I recorded $27.46 in your Victoria savings ledger. No real money has moved yet.

Equivalent wording is allowed only if both facts remain unmistakable.

## Traceability And Change Control

The executable contract suite is `tests/contracts/mvp-safety-contract.test.ts`. Lower-level tests may also enforce the same rule. Test titles must include every rule ID they claim to cover.

| Rule group                                      | Primary current test location                      | Completion gate                                                      |
| ----------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------- |
| `FIN`, `ARC`, `INT`, `APR`, `STA`, `ERR`, `AUD` | Agent contract and unit tests                      | Relevant agent slice cannot complete without applicable tests        |
| `AMT`                                           | Domain money and parser tests                      | Amount-handling slice cannot complete while rules remain `Specified` |
| `IDM`                                           | Agent replay test; future ledger integration tests | Persistent ledger slice requires durable idempotency coverage        |
| `COR`                                           | Type contracts; future ledger integration tests    | Correction slice requires linked-record and effective-total tests    |

When behavior changes:

1. Change or add the normative rule and decision-table row.
2. Add examples and counterexamples.
3. Add or update a test whose title includes the rule ID.
4. Update the rule status only after that test exercises the implementation.
5. Update `docs/decisions.md`, `docs/user-stories.md`, or `docs/mvp.md` when product meaning changes.

Do not reuse retired identifiers. Mark a replaced rule as superseded and link its replacement.

## Explicitly Deferred

- Real bank-transfer approval, settlement, retries, and reconciliation.
- Plaid and provider-specific contracts.
- Foreign-exchange rates and multi-currency ledgers.
- Regulatory or tax reporting.
- The exact correction/reversal record shape, pending the decision already recorded in `docs/decisions.md`.
