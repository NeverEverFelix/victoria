import type { SavingsEvent } from "../../domain/savings/types.js";
import type { PostgresPool } from "../shared/postgres-types.js";
import { sameEvent, validateEvent } from "../../agent/savings-event-store.js";
import type { ConversationSavingsEventStore } from "../../agent/savings-event-store.js";

interface SavingsEventRow {
  readonly event_id: string;
  readonly user_id: string;
  readonly conversation_id: string;
  readonly event_type: string;
  readonly summary: string;
  readonly merchant_name: string | null;
  readonly user_provided_amount_cents: string | null;
  readonly classification_confidence: number;
  readonly created_at: string;
}

/** Durable read/write seam for immutable savings events scoped to a chat owner and conversation. */
export class PostgresConversationSavingsEventStore implements ConversationSavingsEventStore {
  constructor(private readonly db: PostgresPool) {}

  async record(input: { readonly conversationId: string; readonly event: SavingsEvent }): Promise<void> {
    validateEvent(input.event, input.conversationId);
    await this.db.query(
      `INSERT INTO victoria_local_savings_events
        (event_id, user_id, conversation_id, event_type, summary, merchant_name,
         user_provided_amount_cents, classification_confidence, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
       ON CONFLICT (user_id, conversation_id, event_id) DO NOTHING`,
      [input.event.id, input.event.userId, input.conversationId, input.event.type, input.event.summary,
        input.event.merchantName ?? null, input.event.userProvidedAmountCents ?? null,
        input.event.classificationConfidence, input.event.createdAt]
    );
    const saved = await this.db.query<SavingsEventRow>(
      `SELECT event_id, user_id, conversation_id, event_type, summary, merchant_name,
         user_provided_amount_cents::text, classification_confidence, created_at::text
       FROM victoria_local_savings_events
       WHERE user_id = $1 AND conversation_id = $2 AND event_id = $3`,
      [input.event.userId, input.conversationId, input.event.id]
    );
    const row = saved.rows[0];
    if (!row || row.conversation_id !== input.conversationId || !sameEvent(rowToEvent(row), input.event)) {
      throw new Error("A savings event ID cannot be reused for a different event in the same conversation.");
    }
  }

  async list(userId: string, conversationId: string): Promise<readonly SavingsEvent[]> {
    if (!userId.trim() || !conversationId.trim()) return Object.freeze([]);
    const result = await this.db.query<SavingsEventRow>(
      `SELECT event_id, user_id, conversation_id, event_type, summary, merchant_name,
         user_provided_amount_cents::text, classification_confidence, created_at::text
       FROM victoria_local_savings_events
       WHERE user_id = $1 AND conversation_id = $2
       ORDER BY created_at, event_id`,
      [userId, conversationId]
    );
    return Object.freeze(result.rows.map(rowToEvent));
  }
}

function rowToEvent(row: SavingsEventRow): SavingsEvent {
  if (row.event_type !== "avoided_spend") throw new Error("Stored savings event has an unsupported type.");
  const userProvidedAmountCents = row.user_provided_amount_cents === null
    ? undefined
    : parseStoredAmountCents(row.user_provided_amount_cents);
  return Object.freeze({
    id: row.event_id,
    userId: row.user_id,
    type: "avoided_spend",
    summary: row.summary,
    ...(row.merchant_name ? { merchantName: row.merchant_name } : {}),
    ...(userProvidedAmountCents === undefined ? {} : { userProvidedAmountCents }),
    classificationConfidence: row.classification_confidence,
    createdAt: new Date(row.created_at).toISOString()
  });
}

function parseStoredAmountCents(value: string): number {
  if (!/^\d+$/.test(value)) throw new Error("Stored savings event has an invalid user-provided amount.");
  const amount = Number(value);
  if (!Number.isSafeInteger(amount) || amount <= 0) {
    throw new Error("Stored savings event has an invalid user-provided amount.");
  }
  return amount;
}
