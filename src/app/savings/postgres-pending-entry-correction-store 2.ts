import { randomUUID } from "node:crypto";
import { immutableSnapshot } from "../../domain/immutable.js";
import type { PendingEntryCorrectionStore, PersistedPendingEntryCorrection } from "../../agent/pending-entry-correction-store.js";
import type { AgentDecision } from "../../agent/types.js";
import type { PostgresPool } from "../shared/postgres-types.js";

/** Append-only pending correction snapshots and terminal outcomes for persistent chat. */
export class PostgresPendingEntryCorrectionStore implements PendingEntryCorrectionStore {
  constructor(private readonly db: PostgresPool) {}

  async getPending(userId: string, conversationId: string): Promise<PersistedPendingEntryCorrection | null> {
    const result = await this.db.query<{ action_id: string; decision: unknown }>(
      `SELECT p.action_id, p.decision
       FROM victoria_local_entry_correction_proposals p
       WHERE p.user_id = $1 AND p.conversation_id = $2
         AND NOT EXISTS (SELECT 1 FROM victoria_local_entry_correction_transitions t
                         WHERE t.user_id = p.user_id AND t.action_id = p.action_id)
       ORDER BY p.created_at DESC LIMIT 1`, [userId, conversationId]);
    const row = result.rows[0];
    if (!row || !isPendingDecision(row.decision, userId, row.action_id)) return null;
    return Object.freeze({ actionId: row.action_id, decision: immutableSnapshot(row.decision) });
  }

  async commit(input: Parameters<PendingEntryCorrectionStore["commit"]>[0]): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '30s'");
      if (input.pendingAction) {
        const pending = input.pendingAction;
        if (!isPendingDecision(pending.decision, input.userId, pending.actionId)) {
          throw new Error("Only a valid pending entry correction can be persisted.");
        }
        const correction = pending.decision.entryCorrection!;
        await client.query(
          `INSERT INTO victoria_local_entry_correction_proposals
            (proposal_id, user_id, conversation_id, action_id, savings_entry_id, decision, created_at)
           VALUES ($1, $2, $3, $4, $5, $6::jsonb, $7) ON CONFLICT (user_id, action_id) DO NOTHING`,
          [correction.id, input.userId, input.conversationId, pending.actionId, correction.savingsEntryId,
            JSON.stringify(pending.decision), correction.createdAt]);
        const saved = await client.query<{ same: boolean }>(
          `SELECT decision = $3::jsonb AS same FROM victoria_local_entry_correction_proposals
           WHERE user_id = $1 AND action_id = $2`,
          [input.userId, pending.actionId, JSON.stringify(pending.decision)]);
        if (!saved.rows[0]?.same) throw new Error("A correction action cannot be reused for different details.");
      }
      if (input.terminalAction) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [input.userId, input.terminalAction.actionId]);
        const proposal = await client.query<{ proposal_id: string }>(
          `SELECT proposal_id FROM victoria_local_entry_correction_proposals
           WHERE user_id = $1 AND conversation_id = $2 AND action_id = $3`,
          [input.userId, input.conversationId, input.terminalAction.actionId]);
        const proposalId = proposal.rows[0]?.proposal_id;
        if (!proposalId) throw new Error("The correction proposal is not stored for this user and conversation.");
        const prior = await client.query<{ status: string }>(
          "SELECT status FROM victoria_local_entry_correction_transitions WHERE user_id = $1 AND action_id = $2",
          [input.userId, input.terminalAction.actionId]);
        if (prior.rows[0]) {
          if (prior.rows[0].status !== input.terminalAction.status) throw new Error("The correction already has a different terminal outcome.");
        } else {
          const correction = await client.query(
            "SELECT 1 FROM victoria_local_savings_entry_corrections WHERE user_id = $1 AND approved_action_id = $2",
            [input.userId, input.terminalAction.actionId]);
          if (input.terminalAction.status === "recorded" && !correction.rowCount) throw new Error("A correction cannot be marked recorded before its approved write exists.");
          if (input.terminalAction.status !== "recorded" && correction.rowCount) throw new Error("A recorded correction cannot be declined or superseded.");
          await client.query(
            `INSERT INTO victoria_local_entry_correction_transitions
              (transition_id, proposal_id, user_id, conversation_id, action_id, status, created_at)
             VALUES ($1, $2, $3, $4, $5, $6, now())`,
            [randomUUID(), proposalId, input.userId, input.conversationId, input.terminalAction.actionId, input.terminalAction.status]);
        }
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally { client.release(); }
  }
}

function isPendingDecision(value: unknown, userId: string, actionId: string): value is AgentDecision {
  if (!isRecord(value) || value.action !== "correct_ledger_entry" || !isRecord(value.entryCorrection) || !isRecord(value.toolCall)) return false;
  const correction = value.entryCorrection;
  const toolCall = value.toolCall;
  const args = toolCall.arguments;
  const correctedAmountCents = correction.correctedAmountCents;
  return correction.status === "pending" && correction.userId === userId &&
    typeof correction.id === "string" && typeof correction.savingsEntryId === "string" &&
    typeof correctedAmountCents === "number" && Number.isSafeInteger(correctedAmountCents) && correctedAmountCents > 0 &&
    typeof correction.adjustmentCents === "number" && Number.isSafeInteger(correction.adjustmentCents) && typeof correction.reason === "string" &&
    toolCall.name === "createSavingsEntryCorrection" && toolCall.actionId === actionId &&
    toolCall.requiresApproval === true && isRecord(args) && args.savingsEntryId === correction.savingsEntryId &&
    args.correctedAmountCents === correction.correctedAmountCents && args.reason === correction.reason;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}
