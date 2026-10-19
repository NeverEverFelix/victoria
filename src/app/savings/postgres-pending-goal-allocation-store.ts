import { randomUUID } from "node:crypto";
import type { AgentDecision } from "../../agent/types.js";
import type {
  PendingGoalAllocationActionStore,
  PersistedPendingGoalAllocationAction
} from "../../agent/pending-goal-allocation-store.js";
import type { SavingsGoalAllocation } from "../../domain/savings/types.js";
import type { PostgresPool } from "../shared/postgres-types.js";

/** Append-only goal-allocation proposal snapshots and terminal outcomes for local persistent chat. */
export class PostgresPendingGoalAllocationActionStore implements PendingGoalAllocationActionStore {
  constructor(private readonly db: PostgresPool) {}

  async getPending(userId: string, conversationId: string): Promise<PersistedPendingGoalAllocationAction | null> {
    const result = await this.db.query<{ action_id: string; decision: unknown; approval: unknown }>(
      `SELECT p.action_id, p.decision,
         COALESCE(a.approval, CASE WHEN g.approved_action_id IS NOT NULL THEN
           jsonb_build_object('id', g.approval_id, 'actionId', g.approved_action_id,
             'approvedAt', g.approved_at, 'source', 'user_message') END) AS approval
       FROM victoria_local_goal_allocation_proposals p
       LEFT JOIN victoria_local_goal_allocation_action_approvals a
         ON a.user_id = p.user_id AND a.action_id = p.action_id
       LEFT JOIN victoria_local_savings_goal_allocations g
         ON g.user_id = p.user_id AND g.approved_action_id = p.action_id
       WHERE p.user_id = $1 AND p.conversation_id = $2
         AND NOT EXISTS (
           SELECT 1 FROM victoria_local_goal_allocation_transitions t
           WHERE t.user_id = p.user_id AND t.action_id = p.action_id
         )
       ORDER BY p.created_at DESC LIMIT 1`,
      [userId, conversationId]
    );
    const row = result.rows[0];
    if (!row || !isPendingDecision(row.decision, userId, conversationId, row.action_id)) return null;
    const approval = row.approval;
    if (approval !== null && !isApproval(approval, row.action_id)) return null;
    return Object.freeze({
      actionId: row.action_id,
      decision: row.decision,
      ...(approval ? { approval } : {})
    });
  }

  async commit(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly pendingAction?: PersistedPendingGoalAllocationAction;
    readonly approvalAction?: { readonly actionId: string; readonly approval: SavingsGoalAllocation["approval"] };
    readonly terminalAction?: {
      readonly actionId: string;
      readonly status: "recorded" | "declined" | "superseded";
    };
  }): Promise<void> {
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      if (input.terminalAction) {
        await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [
          input.userId, input.terminalAction.actionId
        ]);
      }
      if (input.pendingAction) {
        const pending = input.pendingAction;
        if (!isPendingDecision(pending.decision, input.userId, input.conversationId, pending.actionId) ||
            (pending.approval && !isApproval(pending.approval, pending.actionId))) {
          throw new Error("Only a valid pending goal allocation with matching approval can be persisted.");
        }
        const allocation = pending.decision.goalAllocation!;
        await client.query(
          `INSERT INTO victoria_local_goal_allocation_proposals
            (proposal_id, user_id, conversation_id, action_id, decision, created_at)
           VALUES ($1, $2, $3, $4, $5::jsonb, $6)
           ON CONFLICT (user_id, action_id) DO NOTHING`,
          [allocation.id, input.userId, input.conversationId, pending.actionId,
            JSON.stringify(pending.decision), allocation.createdAt]
        );
        const saved = await client.query<{ same: boolean }>(
          `SELECT decision = $3::jsonb AS same
           FROM victoria_local_goal_allocation_proposals WHERE user_id = $1 AND action_id = $2`,
          [input.userId, pending.actionId, JSON.stringify(pending.decision)]
        );
        if (!saved.rows[0]?.same) throw new Error("A goal allocation action cannot be reused for different details.");
      }
      const approvalAction = input.approvalAction ?? (input.pendingAction?.approval
        ? { actionId: input.pendingAction.actionId, approval: input.pendingAction.approval }
        : undefined);
      if (approvalAction) {
        if (!isApproval(approvalAction.approval, approvalAction.actionId)) {
          throw new Error("A goal allocation approval must match its exact action.");
        }
        const proposal = await client.query(
          "SELECT 1 FROM victoria_local_goal_allocation_proposals WHERE user_id = $1 AND action_id = $2",
          [input.userId, approvalAction.actionId]
        );
        if (!proposal.rowCount) throw new Error("A goal allocation approval requires its persisted proposal.");
        await client.query(
          `INSERT INTO victoria_local_goal_allocation_action_approvals (approval_id, user_id, action_id, approval, created_at)
           VALUES ($1, $2, $3, $4::jsonb, $5) ON CONFLICT (user_id, action_id) DO NOTHING`,
          [approvalAction.approval.id, input.userId, approvalAction.actionId,
            JSON.stringify(approvalAction.approval), approvalAction.approval.approvedAt]
        );
        const savedApproval = await client.query<{ same: boolean }>(
          `SELECT approval = $3::jsonb AS same FROM victoria_local_goal_allocation_action_approvals
           WHERE user_id = $1 AND action_id = $2`,
          [input.userId, approvalAction.actionId, JSON.stringify(approvalAction.approval)]
        );
        if (!savedApproval.rows[0]?.same) throw new Error("A goal allocation approval cannot be changed after it is issued.");
      }
      if (input.terminalAction) {
        await this.insertTerminalAction(client, {
          userId: input.userId,
          conversationId: input.conversationId,
          terminalAction: input.terminalAction
        });
      }
      await client.query("COMMIT");
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  private async insertTerminalAction(
    client: Pick<PostgresPool, "query">,
    input: {
      readonly userId: string;
      readonly conversationId: string;
      readonly terminalAction: { readonly actionId: string; readonly status: "recorded" | "declined" | "superseded" };
    }
  ): Promise<void> {
    const { actionId, status } = input.terminalAction;
    const proposal = await client.query<{ proposal_id: string }>(
      `SELECT proposal_id FROM victoria_local_goal_allocation_proposals
       WHERE user_id = $1 AND conversation_id = $2 AND action_id = $3`,
      [input.userId, input.conversationId, actionId]
    );
    const proposalId = proposal.rows[0]?.proposal_id;
    if (!proposalId) throw new Error("The goal allocation proposal is not stored for this user and conversation.");

    const prior = await client.query<{ status: string }>(
      "SELECT status FROM victoria_local_goal_allocation_transitions WHERE user_id = $1 AND action_id = $2",
      [input.userId, actionId]
    );
    if (prior.rows[0]) {
      if (prior.rows[0].status !== status) throw new Error("A goal allocation already has a different terminal outcome.");
      return;
    }

    const allocation = await client.query(
      "SELECT 1 FROM victoria_local_savings_goal_allocations WHERE user_id = $1 AND approved_action_id = $2",
      [input.userId, actionId]
    );
    if (status === "recorded" && !allocation.rowCount) {
      throw new Error("A goal allocation cannot be marked recorded before its approved write exists.");
    }
    if (status !== "recorded" && allocation.rowCount) {
      throw new Error("A recorded goal allocation cannot be declined or superseded.");
    }
    await client.query(
      `INSERT INTO victoria_local_goal_allocation_transitions
        (transition_id, proposal_id, user_id, conversation_id, action_id, status, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [randomUUID(), proposalId, input.userId, input.conversationId, actionId, status]
    );
  }
}

function isPendingDecision(value: unknown, userId: string, conversationId: string, actionId: string): value is AgentDecision {
  if (!isRecord(value) || !isRecord(value.goalAllocation) || !isRecord(value.toolCall)) return false;
  const allocation = value.goalAllocation;
  const toolCall = value.toolCall;
  const args = toolCall.arguments;
  if (!isRecord(args)) return false;
  return allocation.status === "pending" && allocation.userId === userId &&
    typeof allocation.id === "string" && allocation.id.length > 0 &&
    typeof allocation.savingsEntryId === "string" && allocation.savingsEntryId.length > 0 &&
    Number.isSafeInteger(allocation.amountCents) && (allocation.amountCents as number) > 0 &&
    typeof allocation.goalName === "string" && allocation.goalName.trim().length > 0 &&
    toolCall.name === "createSavingsGoalAllocation" && toolCall.actionId === actionId &&
    toolCall.requiresApproval === true && value.action === "update_goal" &&
    args.userId === userId && args.savingsEntryId === allocation.savingsEntryId &&
    args.amountCents === allocation.amountCents && args.goalName === allocation.goalName &&
    typeof conversationId === "string";
}

function isApproval(value: unknown, actionId: string): value is SavingsGoalAllocation["approval"] {
  if (!isRecord(value)) return false;
  return typeof value.id === "string" && value.id.length > 0 && value.actionId === actionId &&
    typeof value.approvedAt === "string" && Number.isFinite(Date.parse(value.approvedAt)) &&
    value.source === "user_message";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}
