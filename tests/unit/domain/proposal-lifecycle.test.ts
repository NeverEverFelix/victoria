import { describe, expect, it } from "vitest";
import { transitionSavingsProposal } from "../../../src/domain/savings/proposal-lifecycle.js";
import type { SavingsProposal } from "../../../src/domain/savings/types.js";

const pendingProposal: SavingsProposal = {
  id: "proposal_1",
  eventId: "event_1",
  userId: "user_1",
  actionId: "action_1",
  suggestion: {
    id: "suggestion_1", amountCents: 2700, currency: "USD", reason: "User-provided",
    source: "user_provided", movementMode: "mock_ledger"
  },
  status: "pending",
  createdAt: "2026-10-04T10:00:00.000Z"
};

describe("savings proposal lifecycle", () => {
  it("[STA-001] records only a pending proposal approved for its exact user, proposal, and action", () => {
    const approval = {
      id: "approval_1", proposalId: "proposal_1", userId: "user_1", actionId: "action_1",
      source: "user_message" as const, approvedAt: "2026-10-04T10:01:00.000Z"
    };
    const result = transitionSavingsProposal(pendingProposal, {
      id: "transition_1", userId: "user_1", actionId: "action_1", createdAt: approval.approvedAt,
      to: "recorded", approval, ledgerEntryId: "entry_1", recordedAt: approval.approvedAt
    });
    expect(result.proposal).toMatchObject({ status: "recorded", approval, ledgerEntryId: "entry_1" });
    expect(result.transition).toMatchObject({ from: "pending", to: "recorded", proposalId: "proposal_1" });
    expect(pendingProposal.status).toBe("pending");
  });

  it("[STA-001] rejects transitions without an exact user/action approval", () => {
    const approval = {
      id: "approval_1", proposalId: "proposal_1", userId: "user_other", actionId: "action_other",
      source: "user_message" as const, approvedAt: "2026-10-04T10:01:00.000Z"
    };
    expect(() => transitionSavingsProposal(pendingProposal, {
      id: "transition_1", userId: "user_1", actionId: "action_1", createdAt: approval.approvedAt,
      to: "recorded", approval, ledgerEntryId: "entry_1", recordedAt: approval.approvedAt
    })).toThrow("Approval must match the exact proposal, user, and action.");
  });

  it("[STA-003] rejects any transition from a terminal proposal", () => {
    const declined = {
      ...pendingProposal, status: "declined" as const, declinedAt: "2026-10-04T10:01:00.000Z"
    } satisfies SavingsProposal;
    expect(() => transitionSavingsProposal(declined, {
      id: "transition_2", userId: "user_1", actionId: "action_1", createdAt: "2026-10-04T10:02:00.000Z",
      to: "declined"
    })).toThrow("Only a pending proposal can transition.");
  });

  it("[STA-001] records a replacement link when superseding a pending proposal", () => {
    const result = transitionSavingsProposal(pendingProposal, {
      id: "transition_1", userId: "user_1", actionId: "action_1",
      createdAt: "2026-10-04T10:01:00.000Z", to: "superseded", supersededByProposalId: "proposal_2"
    });
    expect(result.proposal).toMatchObject({ status: "superseded", supersededByProposalId: "proposal_2" });
    expect(result.transition).toMatchObject({ from: "pending", to: "superseded", supersededByProposalId: "proposal_2" });
  });
});
