import { randomUUID } from "node:crypto";
import { MockVictoriaTools } from "../../agent/tools/mock-tools.js";
import type {
  CreateSavingsEntryCorrectionInput,
  CreateSavingsEntryInput,
  CreateSavingsGoalAllocationInput
} from "../../agent/tools/contracts.js";
import type { SavingsEntry, SavingsEntryCorrection, SavingsGoalAllocation } from "../../domain/savings/types.js";
import { transitionSavingsProposal } from "../../domain/savings/proposal-lifecycle.js";
import type { AgentDecision } from "../../agent/types.js";
import { immutableSnapshot } from "../../domain/immutable.js";
import type { PostgresPool } from "../shared/postgres-types.js";

/** Local-only mock ledger adapter with durable rows and approved-action idempotency. */
export class PostgresMockSavingsTools extends MockVictoriaTools {
  constructor(private readonly db: PostgresPool) {
    super([], [], (namespace) => `${namespace}_${randomUUID()}`);
  }

  override async createSavingsEntry(input: CreateSavingsEntryInput): Promise<SavingsEntry> {
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
      throw new Error("Savings amount must be a positive safe integer number of cents.");
    }
    if (input.movementMode !== "mock_ledger") {
      throw new Error("The persistent local savings tool only records mocked ledger entries.");
    }
    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '30s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [input.userId, input.approvedActionId]);
      const prior = await client.query<{ to_status: string }>(
        "SELECT to_status FROM victoria_local_savings_proposal_transitions WHERE user_id = $1 AND proposal_id = $2",
        [input.userId, input.proposalId]
      );
      if (prior.rows[0] && prior.rows[0].to_status !== "recorded") {
        throw new Error("This savings proposal already has a non-recorded terminal outcome.");
      }
      const proposalResult = await client.query<{ decision: unknown; conversation_id: string }>(
        "SELECT decision, conversation_id FROM victoria_local_savings_proposals WHERE user_id = $1 AND proposal_id = $2 AND action_id = $3 FOR UPDATE",
        [input.userId, input.proposalId, input.approvedActionId]
      );
      const decision = proposalResult.rows[0]?.decision;
      if (!isMatchingPendingDecision(decision, input)) {
        throw new Error("The saved pending proposal does not match this exact approval.");
      }

      const entryId = `entry_${randomUUID()}`;
      await client.query(
        `INSERT INTO victoria_local_savings_entries
          (entry_id, user_id, event_id, proposal_id, approval_id, approved_action_id,
           amount_cents, currency, reason, goal_name, movement_mode, status, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, 'USD', $8, $9, 'mock_ledger', 'completed', now())
         ON CONFLICT (user_id, approved_action_id) DO NOTHING`,
        [entryId, input.userId, input.eventId, input.proposalId, input.approvalId,
          input.approvedActionId, input.amountCents, input.reason, input.goalName ?? null]
      );
      const saved = await client.query<EntryRow>(
        `SELECT entry_id AS id, user_id AS "userId", event_id AS "eventId", proposal_id AS "proposalId",
           approval_id AS "approvalId", approved_action_id AS "approvedActionId", amount_cents AS "amountCents",
           currency, reason, goal_name AS "goalName", movement_mode AS "movementMode", status,
           created_at::text AS "createdAt"
         FROM victoria_local_savings_entries WHERE user_id = $1 AND approved_action_id = $2 FOR UPDATE`,
        [input.userId, input.approvedActionId]
      );
      const row = saved.rows[0];
      if (!row) throw new Error("The mocked savings entry could not be loaded after its write.");
      const entry = rowToEntry(row);
      if (!sameEntry(entry, input)) throw new Error("An approved action cannot be reused for a different savings entry.");

      if (!prior.rows[0]) {
        const approval = {
          id: input.approvalId,
          proposalId: input.proposalId,
          userId: input.userId,
          actionId: input.approvedActionId,
          source: "user_message" as const,
          approvedAt: entry.createdAt
        };
        const recorded = transitionSavingsProposal(decision.proposal!, {
          id: `proposal_transition_${randomUUID()}`,
          userId: input.userId,
          actionId: input.approvedActionId,
          createdAt: entry.createdAt,
          to: "recorded",
          approval,
          ledgerEntryId: entry.id,
          recordedAt: entry.createdAt
        });
        const snapshot = { transition: recorded.transition, resultingProposal: recorded.proposal, resultingDecision: undefined };
        await client.query(
          `INSERT INTO victoria_local_savings_proposal_transitions
            (transition_id, proposal_id, user_id, conversation_id, action_id, from_status, to_status, snapshot, created_at)
           VALUES ($1, $2, $3, $4, $5, 'pending', 'recorded', $6::jsonb, $7)`,
          [recorded.transition.id, input.proposalId, input.userId, proposalResult.rows[0]!.conversation_id,
            input.approvedActionId, JSON.stringify(snapshot), entry.createdAt]
        );
      }
      await client.query("COMMIT");
      this.hydrateSavingsEntry(entry);
      return immutableSnapshot(entry);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  override async listSavingsEntries(userId: string): Promise<SavingsEntry[]> {
    const result = await this.db.query<EntryRow>(
      `SELECT entry_id AS id, user_id AS "userId", event_id AS "eventId", proposal_id AS "proposalId",
         approval_id AS "approvalId", approved_action_id AS "approvedActionId", amount_cents AS "amountCents",
         currency, reason, goal_name AS "goalName", movement_mode AS "movementMode", status,
         created_at::text AS "createdAt"
       FROM victoria_local_savings_entries WHERE user_id = $1 ORDER BY created_at, entry_id`,
      [userId]
    );
    const entries = result.rows.map(rowToEntry);
    for (const entry of entries) this.hydrateSavingsEntry(entry);
    return entries.map(immutableSnapshot);
  }

  override async createSavingsEntryCorrection(
    input: CreateSavingsEntryCorrectionInput
  ): Promise<SavingsEntryCorrection> {
    if (!Number.isSafeInteger(input.correctedAmountCents) || input.correctedAmountCents <= 0) {
      throw new Error("Corrected savings amount must be a positive safe integer number of cents.");
    }
    if (!input.reason.trim()) throw new Error("A correction reason is required.");

    // Hydrate the linked immutable history before applying this new adjustment
    // to the in-memory safety view.
    await this.listSavingsEntries(input.userId);
    await this.listSavingsEntryCorrections(input.userId);

    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '30s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [input.userId, input.approvedActionId]);
      const existingResult = await client.query<CorrectionRow>(
        `SELECT correction_id AS id, user_id AS "userId", savings_entry_id AS "savingsEntryId",
           prior_amount_cents AS "priorAmountCents", corrected_amount_cents AS "correctedAmountCents",
           adjustment_cents AS "adjustmentCents", reason, approval_id AS "approvalId",
           approved_action_id AS "approvedActionId", created_at::text AS "createdAt"
         FROM victoria_local_savings_entry_corrections WHERE user_id = $1 AND approved_action_id = $2 FOR UPDATE`,
        [input.userId, input.approvedActionId]
      );
      const existing = existingResult.rows[0];
      if (existing) {
        const correction = rowToCorrection(existing);
        if (!sameCorrection(correction, input)) {
          throw new Error("An approved action cannot be reused for a different savings correction.");
        }
        await client.query("COMMIT");
        this.hydrateSavingsEntryCorrection(correction);
        return immutableSnapshot(correction);
      }

      const entryResult = await client.query<{ amount_cents: string; movement_mode: string; status: string }>(
        `SELECT amount_cents::text, movement_mode, status FROM victoria_local_savings_entries
         WHERE user_id = $1 AND entry_id = $2 FOR UPDATE`,
        [input.userId, input.savingsEntryId]
      );
      const entry = entryResult.rows[0];
      if (!entry || entry.status !== "completed" || entry.movement_mode !== "mock_ledger") {
        throw new Error("A correction must reference a completed mocked entry owned by the user.");
      }
      const totals = await client.query<{ adjustment_cents: string | null }>(
        `SELECT COALESCE(sum(adjustment_cents), 0)::text AS adjustment_cents
         FROM victoria_local_savings_entry_corrections WHERE user_id = $1 AND savings_entry_id = $2`,
        [input.userId, input.savingsEntryId]
      );
      const currentAmount = Number(entry.amount_cents) + Number(totals.rows[0]?.adjustment_cents ?? 0);
      const adjustmentCents = input.correctedAmountCents - currentAmount;
      if (!Number.isSafeInteger(currentAmount) || currentAmount <= 0 ||
          !Number.isSafeInteger(adjustmentCents) || adjustmentCents === 0) {
        throw new Error("A correction must change the current amount by a non-zero safe integer number of cents.");
      }

      const approvedAt = new Date().toISOString();
      const approval = {
        id: input.approvalId,
        userId: input.userId,
        actionId: input.approvedActionId,
        source: "user_message" as const,
        approvedAt,
        savingsEntryId: input.savingsEntryId,
        correctedAmountCents: input.correctedAmountCents,
        reason: input.reason
      };
      await client.query(
        `INSERT INTO victoria_local_savings_entry_correction_approvals
          (approval_id, user_id, approved_action_id, savings_entry_id, corrected_amount_cents,
           reason, approval, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7::jsonb, $8)
         ON CONFLICT (user_id, approved_action_id) DO NOTHING`,
        [approval.id, approval.userId, approval.actionId, input.savingsEntryId,
          input.correctedAmountCents, input.reason, JSON.stringify(approval), approvedAt]
      );
      const savedApproval = await client.query<{ same: boolean }>(
        `SELECT approval = $3::jsonb AS same
         FROM victoria_local_savings_entry_correction_approvals
         WHERE user_id = $1 AND approved_action_id = $2`,
        [input.userId, input.approvedActionId, JSON.stringify(approval)]
      );
      if (!savedApproval.rows[0]?.same) {
        throw new Error("An approved action cannot be reused for a different savings correction.");
      }

      const inserted = await client.query<CorrectionRow>(
        `INSERT INTO victoria_local_savings_entry_corrections
          (correction_id, user_id, savings_entry_id, prior_amount_cents, corrected_amount_cents,
           adjustment_cents, reason, approval_id, approved_action_id, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now())
         RETURNING correction_id AS id, user_id AS "userId", savings_entry_id AS "savingsEntryId",
           prior_amount_cents AS "priorAmountCents", corrected_amount_cents AS "correctedAmountCents",
           adjustment_cents AS "adjustmentCents", reason, approval_id AS "approvalId",
           approved_action_id AS "approvedActionId", created_at::text AS "createdAt"`,
        [`entry_correction_${randomUUID()}`, input.userId, input.savingsEntryId, currentAmount,
          input.correctedAmountCents, adjustmentCents, input.reason, input.approvalId, input.approvedActionId]
      );
      const row = inserted.rows[0];
      if (!row) throw new Error("The savings correction could not be loaded after its write.");
      const correction = rowToCorrection(row);
      await client.query("COMMIT");
      this.hydrateSavingsEntryCorrection(correction);
      return immutableSnapshot(correction);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  override async listSavingsEntryCorrections(userId: string): Promise<SavingsEntryCorrection[]> {
    const result = await this.db.query<CorrectionRow>(
      `SELECT correction_id AS id, user_id AS "userId", savings_entry_id AS "savingsEntryId",
         prior_amount_cents AS "priorAmountCents", corrected_amount_cents AS "correctedAmountCents",
         adjustment_cents AS "adjustmentCents", reason, approval_id AS "approvalId",
         approved_action_id AS "approvedActionId", created_at::text AS "createdAt"
       FROM victoria_local_savings_entry_corrections WHERE user_id = $1 ORDER BY created_at, correction_id`,
      [userId]
    );
    const corrections = result.rows.map(rowToCorrection);
    for (const correction of corrections) this.hydrateSavingsEntryCorrection(correction);
    return corrections.map(immutableSnapshot);
  }

  override async createSavingsGoalAllocation(
    input: CreateSavingsGoalAllocationInput
  ): Promise<SavingsGoalAllocation> {
    if (!Number.isSafeInteger(input.amountCents) || input.amountCents <= 0) {
      throw new Error("Goal allocation amount must be a positive safe integer number of cents.");
    }
    if (input.approval.userId !== input.userId || input.approval.actionId !== input.approvedActionId) {
      throw new Error("A goal allocation approval must match its user and approved action.");
    }

    const client = await this.db.connect();
    try {
      await client.query("BEGIN");
      await client.query("SET LOCAL lock_timeout = '30s'");
      await client.query("SELECT pg_advisory_xact_lock(hashtext($1), hashtext($2))", [input.userId, input.approvedActionId]);
      const existingResult = await client.query<GoalAllocationRow>(
        `SELECT allocation_id AS id, user_id AS "userId", savings_entry_id AS "savingsEntryId",
           amount_cents AS "amountCents", goal_name AS "goalName", approved_action_id AS "approvedActionId",
           approval_id AS "approvalId", approved_at::text AS "approvedAt", created_at::text AS "createdAt"
         FROM victoria_local_savings_goal_allocations WHERE user_id = $1 AND approved_action_id = $2 FOR UPDATE`,
        [input.userId, input.approvedActionId]
      );
      const existing = existingResult.rows[0];
      if (existing) {
        const allocation = rowToGoalAllocation(existing);
        if (!sameGoalAllocation(allocation, input)) {
          throw new Error("An approved action cannot be reused for a different goal allocation.");
        }
        await client.query("COMMIT");
        return immutableSnapshot(allocation);
      }

      const proposal = await client.query(
        "SELECT 1 FROM victoria_local_goal_allocation_proposals WHERE user_id = $1 AND action_id = $2",
        [input.userId, input.approvedActionId]
      );
      if (!proposal.rowCount) throw new Error("A goal allocation approval requires its persisted proposal.");
      await client.query(
        `INSERT INTO victoria_local_goal_allocation_action_approvals
          (approval_id, user_id, action_id, approval, created_at)
         VALUES ($1, $2, $3, $4::jsonb, $5)
         ON CONFLICT (user_id, action_id) DO NOTHING`,
        [input.approval.id, input.userId, input.approvedActionId, JSON.stringify(input.approval), input.approval.approvedAt]
      );
      const savedApproval = await client.query<{ same: boolean }>(
        `SELECT approval = $3::jsonb AS same FROM victoria_local_goal_allocation_action_approvals
         WHERE user_id = $1 AND action_id = $2`,
        [input.userId, input.approvedActionId, JSON.stringify(input.approval)]
      );
      if (!savedApproval.rows[0]?.same) throw new Error("The approved action already has a different saved approval.");

      const entryResult = await client.query<{ entry_id: string; amount_cents: string; movement_mode: string; status: string }>(
        `SELECT e.entry_id, e.amount_cents::text, e.movement_mode, e.status
         FROM victoria_local_savings_entries e WHERE e.user_id = $1 AND e.entry_id = $2 FOR UPDATE`,
        [input.userId, input.savingsEntryId]
      );
      const entry = entryResult.rows[0];
      if (!entry || entry.status !== "completed") {
        throw new Error("A goal can only be linked to a completed savings entry owned by the user.");
      }
      if (entry.movement_mode !== "mock_ledger") {
        throw new Error("A goal can only be linked to a mocked savings entry.");
      }
      const corrections = await client.query<{ adjustment_cents: string | null }>(
        `SELECT COALESCE(sum(adjustment_cents), 0)::text AS adjustment_cents
         FROM victoria_local_savings_entry_corrections WHERE user_id = $1 AND savings_entry_id = $2`,
        [input.userId, input.savingsEntryId]
      );
      const effectiveAmountCents = Number(entry.amount_cents) + Number(corrections.rows[0]?.adjustment_cents ?? 0);
      if (effectiveAmountCents !== input.amountCents) {
        throw new Error("A goal allocation must match the linked savings entry's current effective amount.");
      }
      const existingForEntry = await client.query(
        "SELECT allocation_id FROM victoria_local_savings_goal_allocations WHERE user_id = $1 AND savings_entry_id = $2",
        [input.userId, input.savingsEntryId]
      );
      if (existingForEntry.rows[0]) {
        throw new Error("A savings entry can only have one goal allocation.");
      }

      const allocation: SavingsGoalAllocation = immutableSnapshot({
        id: `goal_allocation_${randomUUID()}`,
        userId: input.userId,
        savingsEntryId: input.savingsEntryId,
        amountCents: input.amountCents,
        goalName: input.goalName,
        status: "recorded" as const,
        approval: input.approval,
        approvedActionId: input.approvedActionId,
        createdAt: input.approval.approvedAt
      });
      await client.query(
        `INSERT INTO victoria_local_savings_goal_allocations
          (allocation_id, user_id, savings_entry_id, amount_cents, goal_name,
           approved_action_id, approval_id, approved_at, created_at)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $8)`,
        [allocation.id, allocation.userId, allocation.savingsEntryId, allocation.amountCents,
          allocation.goalName, allocation.approvedActionId, allocation.approval.id, allocation.createdAt]
      );
      await client.query("COMMIT");
      return immutableSnapshot(allocation);
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }

  override async listSavingsGoalAllocations(userId: string): Promise<SavingsGoalAllocation[]> {
    const result = await this.db.query<GoalAllocationRow>(
      `SELECT allocation_id AS id, user_id AS "userId", savings_entry_id AS "savingsEntryId",
         amount_cents AS "amountCents", goal_name AS "goalName", approved_action_id AS "approvedActionId",
         approval_id AS "approvalId", approved_at::text AS "approvedAt", created_at::text AS "createdAt"
       FROM victoria_local_savings_goal_allocations WHERE user_id = $1 ORDER BY created_at, allocation_id`,
      [userId]
    );
    return result.rows.map((row) => immutableSnapshot(rowToGoalAllocation(row)));
  }

  override async getWeeklySavingsTotal(userId: string, asOf = new Date()): Promise<number> {
    await this.listSavingsEntries(userId);
    await this.listSavingsEntryCorrections(userId);
    return super.getWeeklySavingsTotal(userId, asOf);
  }

  override async getEffectiveSavingsEntryAmount(userId: string, savingsEntryId: string): Promise<number | null> {
    await this.listSavingsEntries(userId);
    await this.listSavingsEntryCorrections(userId);
    return super.getEffectiveSavingsEntryAmount(userId, savingsEntryId);
  }
}

function isMatchingPendingDecision(value: unknown, input: CreateSavingsEntryInput): value is AgentDecision {
  if (!value || typeof value !== "object") return false;
  const decision = value as Partial<AgentDecision>;
  const proposal = decision.proposal;
  const event = decision.savingsEvent;
  const suggestion = decision.suggestion;
  return proposal?.status === "pending" && proposal.id === input.proposalId && proposal.userId === input.userId &&
    proposal.actionId === input.approvedActionId && event?.id === input.eventId && event.userId === input.userId &&
    suggestion?.id === input.suggestionId && suggestion.amountCents === input.amountCents &&
    suggestion.reason === input.reason && suggestion.movementMode === "mock_ledger" &&
    proposal.suggestion.id === input.suggestionId && proposal.suggestion.amountCents === input.amountCents &&
    proposal.goalName === input.goalName;
}

interface EntryRow {
  id: string;
  userId: string;
  eventId: string;
  proposalId: string;
  approvalId: string;
  approvedActionId: string;
  amountCents: number;
  currency: "USD";
  reason: string;
  goalName: string | null;
  movementMode: "mock_ledger";
  status: "completed";
  createdAt: string;
}

interface GoalAllocationRow {
  id: string;
  userId: string;
  savingsEntryId: string;
  amountCents: number | string;
  goalName: string;
  approvedActionId: string;
  approvalId: string;
  approvedAt: string;
  createdAt: string;
}

interface CorrectionRow {
  id: string;
  userId: string;
  savingsEntryId: string;
  priorAmountCents: number | string;
  correctedAmountCents: number | string;
  adjustmentCents: number | string;
  reason: string;
  approvalId: string;
  approvedActionId: string;
  createdAt: string;
}

function rowToCorrection(row: CorrectionRow): SavingsEntryCorrection {
  const priorAmountCents = Number(row.priorAmountCents);
  const correction = {
    id: row.id,
    userId: row.userId,
    savingsEntryId: row.savingsEntryId,
    correctedAmountCents: Number(row.correctedAmountCents),
    adjustmentCents: Number(row.adjustmentCents),
    reason: row.reason,
    approvalId: row.approvalId,
    approvedActionId: row.approvedActionId,
    createdAt: new Date(row.createdAt).toISOString()
  };
  assertSafeCents(priorAmountCents, "prior correction amount");
  assertSafeCents(correction.correctedAmountCents, "corrected amount");
  if (!Number.isSafeInteger(correction.adjustmentCents) || correction.adjustmentCents === 0 ||
      priorAmountCents + correction.adjustmentCents !== correction.correctedAmountCents) {
    throw new Error("Stored correction adjustment is outside the safe integer range.");
  }
  return immutableSnapshot(correction);
}

function sameCorrection(correction: SavingsEntryCorrection, input: CreateSavingsEntryCorrectionInput): boolean {
  return correction.userId === input.userId && correction.savingsEntryId === input.savingsEntryId &&
    correction.correctedAmountCents === input.correctedAmountCents && correction.reason === input.reason &&
    correction.approvalId === input.approvalId && correction.approvedActionId === input.approvedActionId;
}

function rowToGoalAllocation(row: GoalAllocationRow): SavingsGoalAllocation {
  const amountCents = Number(row.amountCents);
  assertSafeCents(amountCents, "goal allocation amount");
  return {
    id: row.id,
    userId: row.userId,
    savingsEntryId: row.savingsEntryId,
    amountCents,
    goalName: row.goalName,
    status: "recorded",
    approvedActionId: row.approvedActionId,
    approval: {
      id: row.approvalId,
      userId: row.userId,
      actionId: row.approvedActionId,
      approvedAt: new Date(row.approvedAt).toISOString(),
      source: "user_message"
    },
    createdAt: new Date(row.createdAt).toISOString()
  };
}

function sameGoalAllocation(allocation: SavingsGoalAllocation, input: CreateSavingsGoalAllocationInput): boolean {
  return allocation.userId === input.userId && allocation.approval.userId === input.approval.userId &&
    allocation.savingsEntryId === input.savingsEntryId && allocation.amountCents === input.amountCents &&
    allocation.goalName === input.goalName && allocation.approval.id === input.approval.id &&
    allocation.approval.actionId === input.approval.actionId &&
    allocation.approval.approvedAt === new Date(input.approval.approvedAt).toISOString();
}

function rowToEntry(row: EntryRow): SavingsEntry {
  const amountCents = Number(row.amountCents);
  assertSafeCents(amountCents, "savings entry amount");
  return immutableSnapshot({
    id: row.id,
    userId: row.userId,
    eventId: row.eventId,
    proposalId: row.proposalId,
    approvalId: row.approvalId,
    approvedActionId: row.approvedActionId,
    amountCents,
    currency: row.currency,
    reason: row.reason,
    ...(row.goalName ? { goalName: row.goalName } : {}),
    movementMode: row.movementMode,
    status: row.status,
    createdAt: new Date(row.createdAt).toISOString()
  });
}

function sameEntry(entry: SavingsEntry, input: CreateSavingsEntryInput): boolean {
  return entry.userId === input.userId && entry.eventId === input.eventId && entry.proposalId === input.proposalId &&
    entry.approvalId === input.approvalId && entry.approvedActionId === input.approvedActionId &&
    entry.amountCents === input.amountCents &&
    entry.reason === input.reason && entry.goalName === input.goalName &&
    entry.movementMode === input.movementMode && entry.currency === "USD" && entry.status === "completed";
}

function assertSafeCents(value: number, label: string): void {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`Stored ${label} is outside the positive safe integer cents range.`);
  }
}
