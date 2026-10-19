import type {
  PendingAmountClarification,
  PendingAmountClarificationStore
} from "../../agent/pending-amount-clarification-store.js";
import type { PostgresQueryable } from "../shared/postgres-types.js";

const DEFAULT_TTL_MS = 30 * 60_000;

/** Stores only the short-lived clarification needed to continue an avoided-spend turn. */
export class PostgresPendingAmountClarificationStore implements PendingAmountClarificationStore {
  constructor(
    private readonly db: PostgresQueryable,
    private readonly ttlMs = DEFAULT_TTL_MS
  ) {
    if (!Number.isSafeInteger(ttlMs) || ttlMs <= 0 || ttlMs > 24 * 60 * 60_000) {
      throw new Error("Pending clarification TTL must be between 1 ms and 24 hours.");
    }
  }

  async get(userId: string, conversationId: string): Promise<PendingAmountClarification | null> {
    const result = await this.db.query<{ classification: unknown; savings_event: unknown }>(
      `SELECT classification, savings_event FROM victoria_pending_amount_clarifications
       WHERE user_id = $1 AND conversation_id = $2 AND expires_at > now()`,
      [userId, conversationId]
    );
    const row = result.rows[0];
    if (!row) return null;
    const value = parsePendingClarification(row.classification, row.savings_event, userId);
    return value ? Object.freeze(value) : null;
  }

  async set(userId: string, conversationId: string, value: PendingAmountClarification): Promise<void> {
    if (!userId.trim() || !conversationId.trim() || value.savingsEvent.userId !== userId ||
        value.classification.type !== "avoided_spend") {
      throw new Error("Pending clarification must belong to its user and an avoided-spend event.");
    }
    await this.db.query(
      `INSERT INTO victoria_pending_amount_clarifications
        (user_id, conversation_id, classification, savings_event, updated_at, expires_at)
       VALUES ($1, $2, $3::jsonb, $4::jsonb, now(), $5)
       ON CONFLICT (user_id, conversation_id) DO UPDATE SET
         classification = EXCLUDED.classification,
         savings_event = EXCLUDED.savings_event,
         updated_at = EXCLUDED.updated_at,
         expires_at = EXCLUDED.expires_at`,
      [userId, conversationId, JSON.stringify(value.classification), JSON.stringify(value.savingsEvent),
        new Date(Date.now() + this.ttlMs).toISOString()]
    );
  }

  async clear(userId: string, conversationId: string): Promise<void> {
    await this.db.query(
      "DELETE FROM victoria_pending_amount_clarifications WHERE user_id = $1 AND conversation_id = $2",
      [userId, conversationId]
    );
  }
}

function parsePendingClarification(
  classification: unknown,
  savingsEvent: unknown,
  userId: string
): PendingAmountClarification | null {
  if (!isRecord(classification) || !isRecord(savingsEvent)) return null;
  const isValid = classification.type === "avoided_spend" &&
    typeof classification.confidence === "number" && Number.isFinite(classification.confidence) &&
    classification.confidence >= 0 && classification.confidence <= 1 &&
    typeof classification.summary === "string" &&
    typeof classification.needsClarification === "boolean" &&
    savingsEvent.type === "avoided_spend" && savingsEvent.userId === userId &&
    typeof savingsEvent.id === "string" && savingsEvent.id.length > 0 &&
    typeof savingsEvent.summary === "string" &&
    typeof savingsEvent.classificationConfidence === "number" &&
    Number.isFinite(savingsEvent.classificationConfidence) &&
    typeof savingsEvent.createdAt === "string" && Number.isFinite(Date.parse(savingsEvent.createdAt));
  if (!isValid) return null;
  return {
    classification: classification as unknown as PendingAmountClarification["classification"],
    savingsEvent: savingsEvent as unknown as PendingAmountClarification["savingsEvent"]
  };
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
