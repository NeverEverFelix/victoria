export type MoneyMovementMode = "mock_ledger" | "real_transfer";

export type SavingsEventType = "avoided_spend";

/**
 * A durable record of the financial moment reported by the user.
 * Proposals, approvals, and mocked ledger entries have separate lifecycles.
 */
export interface SavingsEvent {
  readonly id: string;
  readonly userId: string;
  readonly type: SavingsEventType;
  readonly summary: string;
  readonly merchantName?: string;
  readonly userProvidedAmountCents?: number;
  readonly classificationConfidence: number;
  readonly createdAt: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmountCents?: number;
  savedAmountCents: number;
  currency: "USD";
}

export interface SavingsSuggestion {
  readonly id: string;
  readonly amountCents: number;
  readonly currency: "USD";
  readonly reason: string;
  readonly source: "merchant_history" | "user_provided" | "manual_estimate";
  readonly movementMode: MoneyMovementMode;
}

export type SavingsProposalSuggestion = Omit<SavingsSuggestion, "movementMode"> & {
  movementMode: "mock_ledger";
};

export interface SavingsApproval {
  readonly id: string;
  readonly proposalId: string;
  readonly userId: string;
  readonly actionId: string;
  readonly source: "user_message";
  readonly approvedAt: string;
}

interface SavingsProposalBase {
  readonly id: string;
  readonly eventId: string;
  readonly userId: string;
  readonly actionId: string;
  readonly suggestion: SavingsProposalSuggestion;
  readonly goalName?: string;
  readonly supersedesProposalId?: string;
  readonly createdAt: string;
}

export type SavingsProposal =
  | (SavingsProposalBase & {
      status: "pending";
      declinedAt?: never;
      approval?: never;
      ledgerEntryId?: never;
      recordedAt?: never;
      supersededAt?: never;
      supersededByProposalId?: never;
    })
  | (SavingsProposalBase & {
      status: "declined";
      declinedAt: string;
      approval?: never;
      ledgerEntryId?: never;
      recordedAt?: never;
      supersededAt?: never;
      supersededByProposalId?: never;
    })
  | (SavingsProposalBase & {
      status: "recorded";
      declinedAt?: never;
      approval: SavingsApproval;
      ledgerEntryId: string;
      recordedAt: string;
      supersededAt?: never;
      supersededByProposalId?: never;
    })
  | (SavingsProposalBase & {
      status: "superseded";
      declinedAt?: never;
      approval?: never;
      ledgerEntryId?: never;
      recordedAt?: never;
      supersededAt: string;
      supersededByProposalId: string;
    });

export type SavingsProposalTransitionInput = {
  id: string;
  userId: string;
  actionId: string;
  createdAt: string;
} & (
  | { to: "declined" }
  | { to: "superseded"; supersededByProposalId: string }
  | { to: "recorded"; approval: SavingsApproval; ledgerEntryId: string; recordedAt: string }
);

/** Append-only event recording one valid pending-to-terminal proposal transition. */
export interface SavingsProposalTransition {
  readonly id: string;
  readonly proposalId: string;
  readonly userId: string;
  readonly actionId: string;
  readonly from: "pending";
  readonly to: "declined" | "recorded" | "superseded";
  readonly createdAt: string;
  readonly approvalId?: string;
  readonly ledgerEntryId?: string;
  readonly supersededByProposalId?: string;
}

export type SavingsEntryStatus = "pending" | "completed" | "cancelled";

export interface SavingsEntry {
  readonly id: string;
  readonly userId: string;
  readonly eventId: string;
  readonly proposalId: string;
  readonly approvalId: string;
  readonly approvedActionId: string;
  readonly amountCents: number;
  readonly currency: "USD";
  readonly reason: string;
  readonly goalName?: string;
  readonly movementMode: MoneyMovementMode;
  readonly status: SavingsEntryStatus;
  readonly createdAt: string;
}

export interface SavingsEntryLike {
  amountCents: number;
  status: SavingsEntryStatus;
}

export interface SavingsEntryCorrection {
  readonly id: string;
  readonly userId: string;
  readonly savingsEntryId: string;
  readonly correctedAmountCents: number;
  readonly adjustmentCents: number;
  readonly reason: string;
  readonly approvalId: string;
  readonly approvedActionId: string;
  readonly createdAt: string;
}

export interface SavingsGoalAllocationApproval {
  readonly id: string;
  readonly actionId: string;
  readonly approvedAt: string;
  readonly source: "user_message";
}

interface SavingsGoalAllocationBase {
  readonly id: string;
  readonly userId: string;
  readonly savingsEntryId: string;
  readonly amountCents: number;
  readonly goalName: string;
  readonly createdAt: string;
}

export type PendingSavingsGoalAllocation = Readonly<SavingsGoalAllocationBase & {
  status: "pending";
}>;

export type SavingsGoalAllocation = Readonly<SavingsGoalAllocationBase & {
  status: "recorded";
  approvedActionId: string;
  approval: SavingsGoalAllocationApproval;
}>;
