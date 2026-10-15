# Financial Profile Data Lifecycle Proposal

- Status: Lifecycle defaults approved by the user on 2026-10-15; implementation remains sandbox-only and does not authorize live reads.
- Scope: User-authorized, Transactions-only Plaid profile data and derived profile facts.

This proposal makes the retention, disconnect, deletion, and token-key lifecycle concrete enough to review. It does not authorize provider access, production configuration, or user-data migration.

## Recommended Lifecycle

| Data | Proposed handling |
| --- | --- |
| Plaid Item access token | Store only as the existing versioned AES-256-GCM envelope. Never expose it to authenticated database clients, application responses, or model context. |
| Synced transaction rows | Keep only the fields needed for the approved profile and sync reconciliation, scoped to the owning user and Item. Retain at most 90 days; prune older rows only after a successful complete sync and successful profile write. |
| Derived profile facts and embeddings | Keep compact, provenance-bearing facts while the connection is active. Do not use facts older than the existing 90-day freshness boundary. On disconnect, remove Plaid-derived facts and their embeddings, then invalidate the user's memory cache. Preserve user statements, corrections, habits, goals, preferences, and all other non-Plaid personalization. If a preserved correction points to a removed Plaid fact, keep the correction and clear only that source link. |
| Disconnect | Append the revocation event first so reads stop immediately. Mark Items unavailable to sync, remove local transactions and Plaid-derived memories, then call Plaid Item removal and delete the local encrypted Item row. If remote removal fails, retain only the encrypted token envelope in a pending state for an authenticated retry; never log the token. |
| Consent history | Keep only the append-only grant/revocation audit fields already modeled until account deletion. Do not place access tokens or transaction details in the event log. At full account deletion, erase consent history through the dedicated service-role database procedure, after provider and local Plaid cleanup. |
| Encryption-key rotation | Use `encryption_key_version` to support old and new keys during a controlled re-encryption. Do not retire an old key until every stored Item envelope has been re-encrypted and verified. If a key is lost, stop refresh and require a new connection rather than weakening token checks. |

## Operational Items Still To Confirm Before Live Reads

1. Choose the operational backup deletion window and key-rotation completion window for the selected database and secret manager. These cannot be verified from this repository alone.
2. Verify the controlled deletion procedures and migration chain in the deployed pgvector-enabled non-production database.

Until these are decided, live Plaid reads remain disabled. The local mock profile path and sandbox-only runtime boundary do not change.
