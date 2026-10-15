# Financial Profile Data Lifecycle Proposal

- Status: Proposed; not approved for live reads.
- Scope: User-authorized, Transactions-only Plaid profile data and derived profile facts.

This proposal makes the retention, disconnect, deletion, and token-key lifecycle concrete enough to review. It does not authorize provider access, production configuration, or user-data migration.

## Recommended Lifecycle

| Data | Proposed handling |
| --- | --- |
| Plaid Item access token | Store only as the existing versioned AES-256-GCM envelope. Never expose it to authenticated database clients, application responses, or model context. |
| Synced transaction rows | Keep only the fields needed for the approved profile and sync reconciliation, scoped to the owning user and Item. Retain at most the 90-day profile lookback; prune older rows only after a successful complete sync so a failed refresh cannot erase usable data. |
| Derived profile facts and embeddings | Keep compact, provenance-bearing facts while the connection is active. Do not use facts older than the existing 90-day freshness boundary. On disconnect, remove Plaid-derived facts and their embeddings, then invalidate the user's memory cache. Preserve user-authored memories. |
| Disconnect | Append the revocation event first so reads stop immediately. Then call Plaid Item removal and delete the local encrypted Item row; the existing foreign key cascades to transaction rows. Make retries idempotent and retain retry status without retaining the access token in logs. |
| Consent history | Keep only the append-only grant/revocation audit fields already modeled. Do not place access tokens or transaction details in the event log. Decide account-deletion treatment separately; the current append-only database trigger prevents physical deletion. |
| Encryption-key rotation | Use `encryption_key_version` to support old and new keys during a controlled re-encryption. Do not retire an old key until every stored Item envelope has been re-encrypted and verified. If a key is lost, stop refresh and require a new connection rather than weakening token checks. |

## Decisions Still Needed

1. Confirm the proposed 90-day maximum for raw transaction rows and whether pruning occurs only after a successful full refresh.
2. Confirm that disconnect deletes local transaction rows and Plaid-derived profile facts/embeddings while preserving user-authored memories.
3. Decide whether consent audit events are retained until account deletion, retained for a fixed period, or removed through a dedicated account-erasure procedure. The current append-only trigger means physical erasure requires an explicit exception or a separately designed pseudonymization strategy.
4. Choose the operational backup deletion window and key-rotation completion window for the selected database and secret manager. These cannot be verified from this repository alone.

Until these are decided, live Plaid reads remain disabled. The local mock profile path and sandbox-only runtime boundary do not change.
