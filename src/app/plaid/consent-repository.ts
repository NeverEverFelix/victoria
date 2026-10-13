import {
  isPlaidReadProduct,
  type PlaidConnectionConsent,
  type PlaidReadProduct
} from "./create-link-token-handler.js";
import type { PostgresClient, PostgresPool, PostgresQueryResult } from "../turns/postgres-turn-repository.js";

export type PlaidConsentTransactionClient = PostgresClient;
export type PlaidConsentTransactionPool = Pick<PostgresPool, "connect" | "query">;
export type PlaidConsentQueryResult<Row> = PostgresQueryResult<Row>;

export interface PlaidConsentSnapshot extends PlaidConnectionConsent {
  readonly consentId: string;
  readonly purpose: "financial_profile";
  readonly grantedAt: string;
  readonly revokedAt: string | null;
}

export interface RecordPlaidConsentGrantInput {
  readonly eventId: string;
  readonly userId: string;
  readonly products: readonly PlaidReadProduct[];
  readonly grantedAt: string;
}

export interface RevokePlaidConsentInput {
  readonly eventId: string;
  readonly userId: string;
  /** Revocation is bound to the exact grant shown to the user. */
  readonly grantEventId: string;
  readonly revokedAt: string;
}

export interface PlaidConsentRepository {
  recordGrant(input: RecordPlaidConsentGrantInput): Promise<PlaidConsentSnapshot>;
  getConsent(userId: string): Promise<PlaidConsentSnapshot | null>;
  revoke(input: RevokePlaidConsentInput): Promise<PlaidConsentSnapshot | null>;
}

export class InvalidPlaidConsentError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "InvalidPlaidConsentError";
  }
}

export class PlaidConsentConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "PlaidConsentConflictError";
  }
}

export interface PlaidConsentEventRow {
  sequence_id: number;
  event_id: string;
  user_id: string;
  event_type: "granted" | "revoked";
  products: string[];
  purpose: "financial_profile";
  happened_at: string | Date;
  previous_event_id: string | null;
  granted_at: string | Date;
  revoked_at: string | Date | null;
}

/** Append-only PostgreSQL event log for each user's Plaid read-consent lifecycle. */
export class PostgresPlaidConsentRepository implements PlaidConsentRepository {
  constructor(private readonly pool: PlaidConsentTransactionPool) {}

  async recordGrant(input: RecordPlaidConsentGrantInput): Promise<PlaidConsentSnapshot> {
    const normalized = validateGrant(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await lockUser(client, normalized.userId);
      const previous = await latestForUpdate(client, normalized.userId);
      const result = await client.query<PlaidConsentEventRow>(
        `INSERT INTO victoria_plaid_consent_events
          (event_id, user_id, event_type, products, purpose, happened_at, previous_event_id, granted_at, revoked_at)
         VALUES ($1, $2, 'granted', $3, 'financial_profile', $4, $5, $4, NULL)
         RETURNING *`,
        [normalized.eventId, normalized.userId, normalized.products, normalized.grantedAt, previous?.event_id ?? null]
      );
      const row = result.rows[0];
      if (!row) throw new Error("Plaid consent grant was not returned after insertion.");
      const snapshot = toSnapshot(row);
      await client.query("COMMIT");
      return snapshot;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }

  async getConsent(userId: string): Promise<PlaidConsentSnapshot | null> {
    assertUserId(userId);
    const result = await this.pool.query<PlaidConsentEventRow>(
      `SELECT * FROM victoria_plaid_consent_events
       WHERE user_id = $1 ORDER BY sequence_id DESC LIMIT 1`,
      [userId.trim()]
    );
    return result.rows[0] ? toSnapshot(result.rows[0]) : null;
  }

  async revoke(input: RevokePlaidConsentInput): Promise<PlaidConsentSnapshot | null> {
    const normalized = validateRevoke(input);
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      await lockUser(client, normalized.userId);
      const current = await latestForUpdate(client, normalized.userId);
      if (!current) {
        await client.query("COMMIT");
        return null;
      }
      if (current.event_type === "revoked") {
        if (current.previous_event_id !== normalized.grantEventId) {
          throw new PlaidConsentConflictError("Revocation does not match the current consent grant.");
        }
        await client.query("COMMIT");
        return toSnapshot(current);
      }
      if (current.event_id !== normalized.grantEventId) {
        throw new PlaidConsentConflictError("Revocation does not match the current consent grant.");
      }

      const result = await client.query<PlaidConsentEventRow>(
        `INSERT INTO victoria_plaid_consent_events
          (event_id, user_id, event_type, products, purpose, happened_at, previous_event_id, granted_at, revoked_at)
         VALUES ($1, $2, 'revoked', $3, 'financial_profile', $4, $5, $6, $4)
         RETURNING *`,
        [normalized.eventId, normalized.userId, current.products, normalized.revokedAt,
          current.event_id, toIso(current.granted_at)]
      );
      const row = result.rows[0];
      if (!row) throw new Error("Plaid consent revocation was not returned after insertion.");
      const snapshot = toSnapshot(row);
      await client.query("COMMIT");
      return snapshot;
    } catch (error) {
      await rollback(client);
      throw error;
    } finally {
      client.release();
    }
  }
}

async function lockUser(client: PostgresClient, userId: string): Promise<void> {
  await client.query("SELECT pg_advisory_xact_lock(0, hashtext($1))", [userId]);
}

async function latestForUpdate(client: PostgresClient, userId: string): Promise<PlaidConsentEventRow | null> {
  const result = await client.query<PlaidConsentEventRow>(
    `SELECT * FROM victoria_plaid_consent_events
     WHERE user_id = $1 ORDER BY sequence_id DESC LIMIT 1 FOR UPDATE`,
    [userId]
  );
  return result.rows[0] ?? null;
}

function validateGrant(input: RecordPlaidConsentGrantInput): {
  eventId: string;
  userId: string;
  products: PlaidReadProduct[];
  grantedAt: string;
} {
  if (!input || typeof input !== "object" || typeof input.eventId !== "string" || !input.eventId.trim()) {
    throw new InvalidPlaidConsentError("A consent event ID is required.");
  }
  assertUserId(input.userId);
  if (!Array.isArray(input.products) || input.products.length === 0 || !input.products.every(isPlaidReadProduct)) {
    throw new InvalidPlaidConsentError("Consent must include supported read products.");
  }
  return {
    eventId: input.eventId.trim(),
    userId: input.userId.trim(),
    products: [...new Set(input.products)],
    grantedAt: toIso(input.grantedAt)
  };
}

function validateRevoke(input: RevokePlaidConsentInput): {
  eventId: string;
  userId: string;
  grantEventId: string;
  revokedAt: string;
} {
  if (!input || typeof input !== "object" || typeof input.eventId !== "string" || !input.eventId.trim() ||
      typeof input.grantEventId !== "string" || !input.grantEventId.trim()) {
    throw new InvalidPlaidConsentError("A revocation event ID and grant ID are required.");
  }
  assertUserId(input.userId);
  return {
    eventId: input.eventId.trim(),
    userId: input.userId.trim(),
    grantEventId: input.grantEventId.trim(),
    revokedAt: toIso(input.revokedAt)
  };
}

function assertUserId(userId: string): void {
  if (typeof userId !== "string" || !userId.trim()) throw new InvalidPlaidConsentError("A user ID is required.");
}

function toSnapshot(row: PlaidConsentEventRow): PlaidConsentSnapshot {
  if (!Array.isArray(row.products) || !row.products.every(isPlaidReadProduct) || row.purpose !== "financial_profile" ||
      (row.event_type !== "granted" && row.event_type !== "revoked")) {
    throw new Error("Database returned an invalid Plaid consent event.");
  }
  return Object.freeze({
    consentId: row.event_type === "granted" ? row.event_id : row.previous_event_id ?? row.event_id,
    userId: row.user_id,
    status: row.event_type === "granted" ? "active" : "revoked",
    products: Object.freeze([...row.products]),
    purpose: row.purpose,
    grantedAt: toIso(row.granted_at),
    revokedAt: row.revoked_at === null ? null : toIso(row.revoked_at)
  });
}

function toIso(value: string | Date): string {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) throw new InvalidPlaidConsentError("Consent timestamp must be valid.");
  return date.toISOString();
}

async function rollback(client: PostgresClient): Promise<void> {
  try { await client.query("ROLLBACK"); } catch { /* retain the original failure */ }
}
