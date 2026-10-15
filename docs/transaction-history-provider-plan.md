# Transaction History Provider Implementation Plan

- Status: Proposed plan; this document does not approve or enable Plaid data retrieval.
- Scope: A read-only provider for verified, user-scoped typical merchant-spend estimates.
- Out of scope: A general financial profile, an inference specialist, goal inference, transfers, payments, and UI implementation before headless boundaries pass.

## Product Behavior

The agent's intended source order is already represented in `src/agent/context-source-policy.ts` and `src/agent/victoria-agent.ts`:

1. Use a relevant user-owned merchant spend fact when one is remembered.
2. Otherwise, when a transaction-history provider is configured and a merchant is identified, let the provider check for a usable estimate.
3. Propose an estimate when a valid source supplies a positive USD amount.
4. Ask the user for the amount only when no remembered or verified amount is available. Store a valid answer as a separate append-only merchant-spend fact.

The agent does not ask for a separate approval on each provider lookup. A bank connection must already be established through the product's connection flow; if the connection is absent, revoked, unavailable, or returns unusable data, the provider returns no estimate and Victoria asks for the amount. A suggestion still requires normal confirmation before a mocked ledger write.

Transaction-supported spend claims remain append-only: preserve the user's wording and prior records, disclose the evidence basis, and append a linked transaction-supported amount only when the observed amount is materially different under the current threshold.

## Existing Building Blocks

- `src/agent/transaction-history-provider.ts`: provider interface and 90-day/minimum-three-transactions validation.
- `src/agent/context-source-policy.ts`: deterministic memory-first source selection.
- `src/app/plaid/create-link-token-handler.ts` and `src/app/plaid/plaid-link-token-client.ts`: isolated sandbox Link-token scaffolding.
- `src/app/plaid/consent-repository.ts` and `db/migrations/0002_plaid_consent_events.sql`: append-only connection-consent event storage; no access-token vault.
- `tests/fixtures/mock-transaction-history-provider.ts`: test-only exact normalized merchant matching and user isolation.

No route completes Link, exchanges a public token, stores credentials, syncs transactions, or wires Plaid into the agent composition. The default runtime remains mock-backed.

## Decisions Required Before Implementation

These remain product, privacy, security, or policy decisions. The existing optional interface does not settle them:

1. **Provider enablement:** Which environment may connect to Plaid first? Recommended sequence: sandbox tests only, then a separately approved staging pilot; keep production reads disabled until a further review.
2. **Connection authorization and user prompts:** Confirm the distinction between a one-time bank-link authorization and no per-lookup approval. The agent should not interrupt a decision turn for consent. An unlinked or revoked connection should behave as unavailable and lead to the amount question.
3. **Qualifying transactions:** Confirm the lookback interval and treatment of pending transactions, refunds, reversals, duplicate accounts, fees, cash withdrawals, transfers, tips, and split purchases. Minimum three transactions and a maximum 90-day age are current seam thresholds, not a complete profile policy.
4. **Merchant matching:** Confirm how the user-entered/classified merchant is matched to Plaid's enriched merchant name. Initial proposal: case/diacritic/punctuation/spacing normalization only; no fuzzy matching or category substitution.
5. **Retention and disconnect:** Decide whether disconnect immediately removes linked Items and locally cached transaction rows, and define deletion timing, backup handling, and audit retention. Do not retain transaction details without an agreed purpose.
6. **Credential storage:** Choose the production secret-encryption/KMS mechanism and rotation/access policy for Item access tokens. Never return or log access tokens, public tokens, raw transaction payloads, or account identifiers.

### Resolved For The Provider Plan: Typical-Spend Statistic

Use the median of qualifying purchase amounts in integer USD cents. For even-sized samples, average the two middle values and round a half cent up. Require at least three positive safe-integer amounts. This statistic is implemented as `medianTypicalSpendCents` in `src/domain/financial-events/typical-spend.ts`; it does not decide which transaction types qualify or enable transaction retrieval.

## Implementation Sequence After Approval

### 1. Keep the connection boundary server-side

- Wire the existing Link-token handler to verified application identity and the user's connection record.
- Complete Link in the UI only after all headless non-UI work is complete.
- Add a server-side public-token exchange endpoint; take identity from the authenticated session, never from the request body.
- Persist the returned Item identifier and encrypted access token against the authenticated user. The token must stay server-side.
- Make connection grant, disconnect/revoke, token deletion, local-data deletion, and re-link behavior explicit and idempotent.

Plaid's Link flow returns a temporary public token that the backend exchanges for an Item access token; the access token and Item identifier are stored server-side and associated with the signed-in user. See [Plaid Link API](https://plaid.com/docs/api/link/) and [Plaid Quickstart](https://plaid.com/docs/quickstart/).

### 2. Add the smallest persistent transaction read model

- Add an adapter in `src/app/plaid/` that implements the existing `TransactionHistoryProvider` interface without importing Plaid code into `src/agent/`.
- Store only fields needed to reconcile and compute estimates: user ID, Item ID, transaction ID, normalized merchant key, amount in integer cents, transaction date, posted/pending state, and synchronization metadata/cursor.
- Keep any Item access token in a separate encrypted credential boundary; do not put it in the transaction table or agent context.
- Enforce `(user_id, item_id)` ownership at every repository lookup and verify returned rows against the authenticated user before summarization.

### 3. Synchronize with cursor-safe updates

- Use Plaid `/transactions/sync` for incremental updates, storing and advancing its cursor only after applying a complete update page sequence.
- Apply `added`, `modified`, and `removed` changes idempotently. If a sync pagination sequence fails, restart the complete sequence from its initial cursor as required by Plaid's pagination guidance.
- Begin an initial sync after connection; return no estimate until enough history is ready and validated.
- Add a signed webhook route for `SYNC_UPDATES_AVAILABLE` and use it to trigger sync work. Webhook events are signals, not trusted transaction data; verify their authenticity and fetch the updates from the API.
- Do not call `/transactions/refresh` on every conversation turn. Let Victoria query the local bounded summary after normal background/on-demand synchronization.

Plaid currently documents `/transactions/sync` as the cursor-based endpoint for added, modified, and removed transactions and recommends `SYNC_UPDATES_AVAILABLE` for sync-based integrations. Its pagination guidance requires restarting the full pagination loop from the original cursor after certain failures. See [Transactions Sync migration guide](https://plaid.com/docs/transactions/sync-migration/) and [Transactions API](https://plaid.com/docs/api/products/transactions/).

### 4. Build a conservative merchant summary

- Prefer Plaid's `merchant_name`; the `name` field is legacy. Treat a missing merchant name as unmatched rather than inferring from unrelated descriptions.
- Normalize merchant names deterministically; begin with case, diacritic, punctuation, and whitespace normalization, with no fuzzy matches.
- Include only the transaction types agreed in the product decision. Initial proposal is posted debit purchases; exclude pending items, incoming credits/refunds, transfers, and removed transactions.
- Compute the median from qualifying transactions in the approved lookback window and return only `{ amountCents, transactionCount, observedThrough }` to the agent.
- Return `null` for no matching merchant, fewer than three qualifying purchases, stale or future-dated data, disconnected/revoked Items, provider errors, or invalid records.
- Never send raw transactions or account metadata into model prompts.

Plaid describes `merchant_name` as its enriched human-readable merchant field and marks `name` as a legacy field; the merchant name can be null when no meaningful merchant exists. See [Transactions API](https://plaid.com/docs/api/products/transactions/).

### 5. Wire the optional provider behind a disabled-by-default boundary

- Add provider composition only through `src/app/create-victoria-agent.ts` or a dedicated application factory; keep the default/test runtime mock-backed.
- Add an explicit read-provider feature flag that defaults off, validates environment compatibility, and cannot enable transfer/payment products.
- If provider setup, ownership checks, authorization state, data validation, or Plaid calls fail, return no evidence. The agent then asks the user for the amount and can remember their answer.
- Do not add a new per-turn consent prompt. The connection lifecycle remains separate from the agent's deterministic source choice.

## Required Test Coverage

- Provider disabled/default and sandbox-enabled configuration; production reads remain disabled until explicitly approved.
- Public-token exchange binds only to authenticated user; token never appears in response, logs, or agent context.
- Cross-user and cross-Item isolation, including a provider/repository returning a row with the wrong owner.
- Link absent, revoked, reconnecting, provider error, authentication failure, invalid response, and malformed stored credential all return no estimate.
- Sync pagination, duplicate webhook delivery, added/modified/removed transactions, cursor persistence and retry from the original cursor.
- Merchant normalization, merchant miss, ambiguous merchant, pending transaction, refund, transfer, duplicate transaction, minimum count, stale/future data, and cent arithmetic.
- Agent uses relevant spend memory first; otherwise uses a valid provider estimate without asking; otherwise asks and remembers the user's amount; every suggestion still requires the normal approval before ledger recording.
- A transaction-supported correction appends linked memory and preserves all prior user statements and estimates.
- Disconnect stops reads and applies the approved deletion policy.

## Release Gate

Do not implement the external adapter until the decisions above are recorded in `docs/decisions.md` and a separate product/safety review approves the slice. Before any production read is enabled, verify current Plaid documentation, validate the security and deletion design, run sandbox integration tests, and obtain a separate production-read approval. This plan does not authorize a Plaid credential, data read, or production change.
