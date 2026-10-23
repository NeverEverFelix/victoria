import type { AgentDecision } from "../../agent/types.js";
import type {
  PendingSavingsActionStore,
  PersistedPendingSavingsAction
} from "../../agent/pending-savings-action-store.js";
import type { SavingsProposalTransition } from "../../domain/savings/types.js";
import type { PostgresPool } from "../shared/postgres-types.js";

/** Append-only proposal snapshots and terminal transitions for local persistent chat. */
export class PostgresPendingSavingsActionStore implements PendingSavingsActionStore {
  constructor(private readonly db: PostgresPool) {}

  async getPending(userId: string, conversationId: string): Promise<PersistedPendingSavingsAction | null> {
    const result = await this.db.query<{ action_id: string; decision: unknown }>(
      `SELECT p.action_id, p.decision
       FROM victoria_local_savings_proposals p
       WHERE p.user_id = $1 AND p.conversation_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM victoria_local_savings_proposal_transitions t
           WHERE t.user_id = p.user_id AND t.proposal_id = p.proposal_id
         )
       ORDER BY p.created_at DESC LIMIT 1`,
      [userId, conversationId]
    );
    const row = result.rows[0];
    if (!row || !isPendingDecision(row.decision, userId, row.action_id)) return null;
    return Object.freeze({ actionId: row.action_id, decision: row.decision });
  }

  async commit(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly pendingAction?: PersistedPendingSavingsAction;
    readonly responseDecision: AgentDecision;
  }): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '30s'");
      const pending = input.pendingAction;
      if (pending) {
        if (!isPendingDecision(pending.decision, input.userId, pending.actionId)) {
          throw new Error("Only a valid pending mocked savings proposal can be persisted.");
        }
        const proposal = pending.decision.proposal!;
        await client.query(
          `INSERT INTO victoria_local_savings_proposals
            (proposal_id, user_id, conversation_id, action_id, decision, created_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6)
           ON CONFLICT (user_id, proposal_id) DO NOTHING`,
          [proposal.id, input.userId, input.conversationId, pending.actionId,
            JSON.stringify(pending.decision), proposal.createdAt]
        );
      }

      for (const transition of input.responseDecision.proposalTransitions ?? []) {
        await client.query(
          "SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))",
          [input.userId, transition.actionId]
        );
        await this.insertTransition(client, input, transition);
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertTransition(
    client: Pick<PostgresPool, "query">,
    input: { readonly userId: string; readonly conversationId: string; readonly responseDecision: AgentDecision },
    transition: SavingsProposalTransition
  ): Promise<void> {
    if (transition.userId !== input.userId) throw new Error("Proposal transition user does not match the chat session.");
    const snapshot = {
      transition,
      resultingProposal: input.responseDecision.proposal?.id === transition.proposalId
        ? input.responseDecision.proposal
        : undefined,
      resultingDecision: input.responseDecision.proposal?.id === transition.proposalId
        ? input.responseDecision
        : undefined
    };
    const prior = await client.query<{ transition_id: string; action_id: string; to_status: string }>(
      "SELECT transition_id, action_id, to_status FROM victoria_local_savings_proposal_transitions WHERE user_id = $1 AND proposal_id = $2",
      [transition.userId, transition.proposalId]
    );
    const saved = prior.rows[0];
    if (saved) {
      if (saved.action_id !== transition.actionId || saved.to_status !== transition.to) {
        throw new Error("A savings proposal already has a different terminal transition.");
      }
      return;
    }
    if (transition.to !== "recorded") {
      const entry = await client.query(
        "SELECT 1 FROM victoria_local_savings_entries WHERE user_id = $1 AND approved_action_id = $2",
        [transition.userId, transition.actionId]
      );
      if (entry.rowCount) throw new Error("A savings action with a ledger entry cannot be declined or superseded.");
    }
    const inserted = await client.query(
      `INSERT INTO victoria_local_savings_proposal_transitions
        (transition_id, proposal_id, user_id, conversation_id, action_id, from_status, to_status, snapshot, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8::jsonb, $9)
       ON CONFLICT (user_id, proposal_id) DO NOTHING RETURNING transition_id`,
      [transition.id, transition.proposalId, transition.userId, input.conversationId,
        transition.actionId, transition.from, transition.to, JSON.stringify(snapshot), transition.createdAt]
    );
    if (inserted.rowCount) return;
    throw new Error("A savings proposal terminal transition could not be committed.");
  }
}

function isPendingDecision(value: unknown, userId: string, actionId: string): value is AgentDecision {
  if (!isRecord(value) || !isRecord(value.proposal) || !isRecord(value.toolCall) ||
      !isRecord(value.savingsEvent) || !isRecord(value.suggestion)) return false;
  const proposal = value.proposal;
  const toolCall = value.toolCall;
  return proposal.status === "pending" && proposal.userId === userId && proposal.actionId === actionId &&
    typeof proposal.id === "string" && proposal.id.length > 0 &&
    value.savingsEvent.userId === userId && value.savingsEvent.type === "avoided_spend" &&
    toolCall.name === "createSavingsEntry" && toolCall.actionId === actionId && toolCall.requiresApproval === true &&
    value.suggestion.movementMode === "mock_ledger" &&
    Number.isSafeInteger(value.suggestion.amountCents) && (value.suggestion.amountCents as number) > 0;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
