import type {
  SavingsProposal,
  SavingsProposalTransition,
  SavingsProposalTransitionInput
} from "./types.js";

export function transitionSavingsProposal(
  proposal: SavingsProposal,
  input: SavingsProposalTransitionInput
): { proposal: SavingsProposal; transition: SavingsProposalTransition } {
  if (proposal.status !== "pending") {
    throw new Error("Only a pending proposal can transition.");
  }
  if (input.userId !== proposal.userId || input.actionId !== proposal.actionId) {
    throw new Error("A proposal transition must match the proposal's user and action.");
  }

  let nextProposal: SavingsProposal;
  let transitionDetails: Pick<SavingsProposalTransition, "approvalId" | "ledgerEntryId" | "supersededByProposalId"> = {};

  switch (input.to) {
    case "declined":
      nextProposal = { ...proposal, status: "declined", declinedAt: input.createdAt };
      break;
    case "superseded":
      if (!input.supersededByProposalId || input.supersededByProposalId === proposal.id) {
        throw new Error("A superseded proposal must link to a different replacement proposal.");
      }
      nextProposal = {
        ...proposal,
        status: "superseded",
        supersededAt: input.createdAt,
        supersededByProposalId: input.supersededByProposalId
      };
      transitionDetails = { supersededByProposalId: input.supersededByProposalId };
      break;
    case "recorded":
      if (
        input.approval.proposalId !== proposal.id ||
        input.approval.userId !== proposal.userId ||
        input.approval.actionId !== proposal.actionId ||
        input.ledgerEntryId.length === 0
      ) {
        throw new Error("Approval must match the exact proposal, user, and action.");
      }
      nextProposal = {
        ...proposal,
        status: "recorded",
        approval: input.approval,
        ledgerEntryId: input.ledgerEntryId,
        recordedAt: input.recordedAt
      };
      transitionDetails = { approvalId: input.approval.id, ledgerEntryId: input.ledgerEntryId };
      break;
  }

  return {
    proposal: nextProposal,
    transition: {
      id: input.id,
      proposalId: proposal.id,
      userId: input.userId,
      actionId: input.actionId,
      from: "pending",
      to: input.to,
      createdAt: input.createdAt,
      ...transitionDetails
    }
  };
}
