export type MoneyMovementMode = "mock_ledger" | "real_transfer";

export type SavingsEventType = "avoided_spend";

/**
 * A durable record of the financial moment reported by the user.
 * Proposals, approvals, and mocked ledger entries have separate lifecycles.
 */
export interface SavingsEvent {
  id: string;
  userId: string;
  type: SavingsEventType;
  summary: string;
  merchantName?: string;
  userProvidedAmountCents?: number;
  classificationConfidence: number;
  createdAt: string;
}

export interface SavingsGoal {
  id: string;
  name: string;
  targetAmountCents?: number;
  savedAmountCents: number;
  currency: "USD";
}

export interface SavingsSuggestion {
  id: string;
  amountCents: number;
  currency: "USD";
  reason: string;
  source: "merchant_history" | "user_provided" | "manual_estimate";
  movementMode: MoneyMovementMode;
}

export type SavingsProposalSuggestion = Omit<SavingsSuggestion, "movementMode"> & {
  movementMode: "mock_ledger";
};

export interface SavingsApproval {
  id: string;
  proposalId: string;
  userId: string;
  actionId: string;
  source: "user_message";
  approvedAt: string;
}

interface SavingsProposalBase {
  id: string;
  eventId: string;
  userId: string;
  suggestion: SavingsProposalSuggestion;
  createdAt: string;
}

export type SavingsProposal =
  | (SavingsProposalBase & {
      status: "pending";
      declinedAt?: never;
      approval?: never;
      ledgerEntryId?: never;
      recordedAt?: never;
    })
  | (SavingsProposalBase & {
      status: "declined";
      declinedAt: string;
      approval?: never;
      ledgerEntryId?: never;
      recordedAt?: never;
    })
  | (SavingsProposalBase & {
      status: "recorded";
      declinedAt?: never;
      approval: SavingsApproval;
      ledgerEntryId: string;
      recordedAt: string;
    });

export type SavingsEntryStatus = "pending" | "completed" | "cancelled";

export interface SavingsEntry {
  id: string;
  userId: string;
  eventId: string;
  proposalId: string;
  approvalId: string;
  approvedActionId: string;
  amountCents: number;
  currency: "USD";
  reason: string;
  movementMode: MoneyMovementMode;
  status: SavingsEntryStatus;
  createdAt: string;
}

export interface SavingsEntryLike {
  amountCents: number;
  status: SavingsEntryStatus;
}
