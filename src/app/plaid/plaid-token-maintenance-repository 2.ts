import type { EncryptedPlaidAccessToken } from "./access-token-cipher.js";
import type { PlaidRevocationItem } from "./plaid-data-repository.js";
import type { PostgresPool } from "../shared/postgres-types.js";

/** Restricted, explicit cross-user operations used only by token-key maintenance. */
export interface PlaidTokenMaintenanceRepository {
  replaceToken(userId: string, itemId: string, token: EncryptedPlaidAccessToken): Promise<EncryptedPlaidAccessToken>;
  listAllEncryptedTokens(): Promise<readonly PlaidRevocationItem[]>;
}

export class PostgresPlaidTokenMaintenanceRepository implements PlaidTokenMaintenanceRepository {
  constructor(private readonly pool: PostgresPool) {}

  async replaceToken(userId: string, itemId: string, token: EncryptedPlaidAccessToken): Promise<EncryptedPlaidAccessToken> {
    if (!userId.trim() || !itemId.trim()) throw new Error("A user and Plaid Item ID are required.");
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const item = await client.query(`UPDATE victoria_plaid_items SET access_token_ciphertext=$3,access_token_iv=$4,
        access_token_auth_tag=$5,encryption_key_version=$6,updated_at=now() WHERE user_id=$1 AND item_id=$2`,
        [userId, itemId, token.ciphertext, token.iv, token.authTag, token.keyVersion]);
      const queue = await client.query(`UPDATE victoria_plaid_revocation_queue SET access_token_ciphertext=$3,access_token_iv=$4,
        access_token_auth_tag=$5,encryption_key_version=$6 WHERE user_id=$1 AND item_id=$2`,
        [userId, itemId, token.ciphertext, token.iv, token.authTag, token.keyVersion]);
      if ((item.rowCount ?? 0) + (queue.rowCount ?? 0) !== 1) throw new Error("Plaid token rotation target was not found or was ambiguous.");
      const persisted = await client.query<{ access_token_ciphertext: string; access_token_iv: string;
        access_token_auth_tag: string; encryption_key_version: string }>(
        `SELECT access_token_ciphertext,access_token_iv,access_token_auth_tag,encryption_key_version
         FROM victoria_plaid_items WHERE user_id=$1 AND item_id=$2
         UNION ALL
         SELECT access_token_ciphertext,access_token_iv,access_token_auth_tag,encryption_key_version
         FROM victoria_plaid_revocation_queue WHERE user_id=$1 AND item_id=$2`, [userId, itemId]);
      if (persisted.rows.length !== 1) throw new Error("Plaid token rotation verification failed.");
      const row = persisted.rows[0]!;
      const result = Object.freeze({ ciphertext: row.access_token_ciphertext, iv: row.access_token_iv,
        authTag: row.access_token_auth_tag, keyVersion: row.encryption_key_version });
      await client.query("COMMIT");
      return result;
    } catch (error) {
      try { await client.query("ROLLBACK"); } catch { /* retain original error */ }
      throw error;
    } finally { client.release(); }
  }

  async listAllEncryptedTokens(): Promise<readonly PlaidRevocationItem[]> {
    const result = await this.pool.query<{ user_id: string; item_id: string; access_token_ciphertext: string;
      access_token_iv: string; access_token_auth_tag: string; encryption_key_version: string; attempts: number }>(
      `SELECT user_id,item_id,access_token_ciphertext,access_token_iv,access_token_auth_tag,encryption_key_version,0 AS attempts
       FROM victoria_plaid_items
       UNION ALL
       SELECT user_id,item_id,access_token_ciphertext,access_token_iv,access_token_auth_tag,encryption_key_version,attempts
       FROM victoria_plaid_revocation_queue`);
    return Object.freeze(result.rows.map((row) => Object.freeze({ userId: row.user_id, itemId: row.item_id,
      token: Object.freeze({ ciphertext: row.access_token_ciphertext, iv: row.access_token_iv,
        authTag: row.access_token_auth_tag, keyVersion: row.encryption_key_version }), attempts: row.attempts })));
  }
}
