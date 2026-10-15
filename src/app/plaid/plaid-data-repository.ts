import type { EncryptedPlaidAccessToken } from "./access-token-cipher.js";
import type { PlaidSyncedTransaction, PlaidTransactionSyncPage } from "./plaid-api-client.js";
import type { PostgresPool, PostgresQueryable } from "../turns/postgres-turn-repository.js";

export interface PlaidStoredItem {
  readonly userId: string;
  readonly itemId: string;
  readonly token: EncryptedPlaidAccessToken;
  readonly cursor: string | null;
}

export interface PlaidFinancialTransaction extends PlaidSyncedTransaction {
  readonly itemId: string;
}

export interface PlaidDataRepository {
  storeItem(userId: string, itemId: string, token: EncryptedPlaidAccessToken): Promise<void>;
  listItems(userId: string): Promise<readonly PlaidStoredItem[]>;
  applySyncPage(userId: string, itemId: string, page: PlaidTransactionSyncPage): Promise<void>;
  listTransactions(userId: string, sinceDate: string): Promise<readonly PlaidFinancialTransaction[]>;
}

/** User-scoped persistence for encrypted Plaid Items and the minimal profile read model. */
export class PostgresPlaidDataRepository implements PlaidDataRepository {
  constructor(private readonly pool: PostgresPool) {}

  async storeItem(userId: string, itemId: string, token: EncryptedPlaidAccessToken): Promise<void> {
    assertIdentity(userId, itemId);
    const result = await this.pool.query<{ item_id: string }>(
      `INSERT INTO victoria_plaid_items
        (user_id, item_id, access_token_ciphertext, access_token_iv, access_token_auth_tag, encryption_key_version)
       VALUES ($1, $2, $3, $4, $5, $6)
       ON CONFLICT (user_id, item_id) DO UPDATE SET
         access_token_ciphertext = EXCLUDED.access_token_ciphertext,
         access_token_iv = EXCLUDED.access_token_iv,
         access_token_auth_tag = EXCLUDED.access_token_auth_tag,
         encryption_key_version = EXCLUDED.encryption_key_version,
         updated_at = now()
       RETURNING item_id`,
      [userId, itemId, token.ciphertext, token.iv, token.authTag, token.keyVersion]
    );
    if (result.rows.length !== 1) throw new Error("Plaid Item storage failed.");
  }

  async listItems(userId: string): Promise<readonly PlaidStoredItem[]> {
    if (!userId.trim()) throw new Error("A user ID is required.");
    const result = await this.pool.query<{
      user_id: string; item_id: string; access_token_ciphertext: string; access_token_iv: string;
      access_token_auth_tag: string; encryption_key_version: string; sync_cursor: string | null;
    }>(`SELECT user_id, item_id, access_token_ciphertext, access_token_iv, access_token_auth_tag,
          encryption_key_version, sync_cursor FROM victoria_plaid_items WHERE user_id = $1`, [userId]);
    return result.rows.map((row) => Object.freeze({ userId: row.user_id, itemId: row.item_id,
      token: Object.freeze({ ciphertext: row.access_token_ciphertext, iv: row.access_token_iv,
        authTag: row.access_token_auth_tag, keyVersion: row.encryption_key_version }), cursor: row.sync_cursor }));
  }

  async applySyncPage(userId: string, itemId: string, page: PlaidTransactionSyncPage): Promise<void> {
    assertIdentity(userId, itemId);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const owned = await client.query<{ item_id: string }>(
        "SELECT item_id FROM victoria_plaid_items WHERE user_id = $1 AND item_id = $2 FOR UPDATE", [userId, itemId]);
      if (owned.rows.length !== 1) throw new Error("Plaid Item is not owned by this user.");
      for (const transaction of [...page.added, ...page.modified]) {
        await upsertTransaction(client, userId, itemId, transaction);
      }
      if (page.removed.length > 0) {
        await client.query("DELETE FROM victoria_plaid_transactions WHERE user_id = $1 AND item_id = $2 AND transaction_id = ANY($3::text[])",
          [userId, itemId, page.removed]);
      }
      await client.query("UPDATE victoria_plaid_items SET sync_cursor = $1, updated_at = now() WHERE user_id = $2 AND item_id = $3",
        [page.nextCursor, userId, itemId]);
      await client.query("COMMIT");
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* retain the original failure */ }
      throw error;
    } finally { client.release(); }
  }

  async listTransactions(userId: string, sinceDate: string): Promise<readonly PlaidFinancialTransaction[]> {
    if (!userId.trim()) throw new Error("A user ID is required.");
    if (!/^\d{4}-\d{2}-\d{2}$/.test(sinceDate) || !Number.isFinite(Date.parse(`${sinceDate}T00:00:00.000Z`))) {
      throw new Error("A valid transaction start date is required in YYYY-MM-DD format.");
    }
    const result = await this.pool.query<{
      item_id: string; transaction_id: string; amount_cents: string | number; currency_code: string | null;
      transaction_date: string; merchant_name: string | null; category: string | null; detailed_category: string | null;
      merchant_entity_id: string | null; payment_channel: string | null; pending: boolean;
    }>(`SELECT item_id, transaction_id, amount_cents, currency_code, transaction_date::text AS transaction_date,
          merchant_name, category, detailed_category, merchant_entity_id, payment_channel, pending FROM victoria_plaid_transactions
       WHERE user_id = $1 AND transaction_date >= $2 ORDER BY transaction_date DESC`, [userId, sinceDate]);
    return result.rows.map((row) => {
      const amountCents = Number(row.amount_cents);
      if (!Number.isSafeInteger(amountCents)) throw new Error("Stored Plaid transaction amount is not safe integer cents.");
      return Object.freeze({ itemId: row.item_id, transactionId: row.transaction_id,
        amountCents, currencyCode: row.currency_code, date: row.transaction_date,
        merchantName: row.merchant_name, category: row.category, detailedCategory: row.detailed_category,
        merchantEntityId: row.merchant_entity_id, paymentChannel: row.payment_channel, pending: row.pending });
    });
  }
}

async function upsertTransaction(db: PostgresQueryable, userId: string, itemId: string, value: PlaidSyncedTransaction): Promise<void> {
  if (!Number.isSafeInteger(value.amountCents)) throw new Error("Plaid transaction amount must be safe integer cents.");
  await db.query(`INSERT INTO victoria_plaid_transactions
      (user_id, item_id, transaction_id, amount_cents, currency_code, transaction_date, merchant_name, category,
       detailed_category, merchant_entity_id, payment_channel, pending, updated_at)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,now())
    ON CONFLICT (user_id, item_id, transaction_id) DO UPDATE SET amount_cents=EXCLUDED.amount_cents,
      currency_code=EXCLUDED.currency_code, transaction_date=EXCLUDED.transaction_date,
      merchant_name=EXCLUDED.merchant_name, category=EXCLUDED.category, detailed_category=EXCLUDED.detailed_category,
      merchant_entity_id=EXCLUDED.merchant_entity_id, payment_channel=EXCLUDED.payment_channel,
      pending=EXCLUDED.pending, updated_at=now()`,
    [userId, itemId, value.transactionId, value.amountCents, value.currencyCode, value.date,
      value.merchantName, value.category, value.detailedCategory, value.merchantEntityId, value.paymentChannel, value.pending]);
}

function assertIdentity(userId: string, itemId: string): void {
  if (typeof userId !== "string" || !userId.trim() || typeof itemId !== "string" || !itemId.trim()) {
    throw new Error("A user and Plaid Item ID are required.");
  }
}
