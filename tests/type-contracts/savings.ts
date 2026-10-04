import type {
  SavingsApproval,
  SavingsProposal,
  SavingsProposalSuggestion,
  SavingsSuggestion
} from "../../src/domain/savings/types.js";

const suggestion: SavingsProposalSuggestion = {
  id: "suggestion_123",
  amountCents: 9000,
  currency: "USD",
  reason: "The user said they avoided buying a $90 jacket.",
  source: "user_provided",
  movementMode: "mock_ledger"
};

const proposalFields = {
  id: "proposal_123",
  eventId: "event_123",
  userId: "user_123",
  actionId: "action_123",
  suggestion,
  createdAt: "2026-09-28T12:00:00.000Z"
} as const;

const approval: SavingsApproval = {
  id: "approval_123",
  proposalId: proposalFields.id,
  userId: proposalFields.userId,
  actionId: "action_123",
  source: "user_message",
  approvedAt: "2026-09-28T12:01:00.000Z"
};

const pendingProposal = {
  ...proposalFields,
  status: "pending"
} satisfies SavingsProposal;

const recordedProposal = {
  ...proposalFields,
  status: "recorded",
  approval,
  ledgerEntryId: "entry_123",
  recordedAt: "2026-09-28T12:01:00.000Z"
} satisfies SavingsProposal;

// @ts-expect-error Pending proposals cannot reference a ledger entry.
const invalidPendingProposal: SavingsProposal = {
  ...proposalFields,
  status: "pending",
  ledgerEntryId: "entry_123"
};

// @ts-expect-error Recorded proposals require explicit approval details.
const invalidRecordedProposal: SavingsProposal = {
  ...proposalFields,
  status: "recorded",
  ledgerEntryId: "entry_123",
  recordedAt: "2026-09-28T12:01:00.000Z"
};

const realTransferSuggestion: SavingsSuggestion = {
  ...suggestion,
  movementMode: "real_transfer"
};

const invalidRealTransferProposal: SavingsProposal = {
  ...proposalFields,
  // @ts-expect-error MVP savings proposals cannot represent real transfers.
  suggestion: realTransferSuggestion,
  status: "pending"
};

void pendingProposal;
void recordedProposal;
void invalidPendingProposal;
void invalidRecordedProposal;
void invalidRealTransferProposal;
