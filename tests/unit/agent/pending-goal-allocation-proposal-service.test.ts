import { describe, expect, it, vi } from "vitest";
import type { SavingsEntry } from "../../../src/domain/savings/types.js";
import { PendingGoalAllocationProposalService } from "../../../src/agent/pending-goal-allocation-proposal-service.js";
import { PendingGoalAllocationService } from "../../../src/agent/pending-goal-allocation-service.js";
import type { AgentRequest, ClassifiedMessage } from "../../../src/agent/types.js";

const request: AgentRequest = { userId: "user-1", conversationId: "chat-1", message: "Link this to my emergency fund." };
const entry: SavingsEntry = {
  id: "entry-1", userId: "user-1", eventId: "event-1", proposalId: "proposal-1", approvalId: "approval-1",
  approvedActionId: "action-1", amountCents: 2000, currency: "USD", reason: "Original amount",
  movementMode: "mock_ledger", status: "completed", createdAt: "2026-10-30T12:00:00.000Z"
};
const classification: ClassifiedMessage = {
  type: "goal_allocation", confidence: 1, goalName: "emergency fund",
  summary: "Link the entry to emergency fund", needsClarification: false
};

describe("PendingGoalAllocationProposalService", () => {
  it("creates an exact approval-gated allocation using the verified current entry amount", async () => {
    const pendingAllocations = new PendingGoalAllocationService();
    const service = new PendingGoalAllocationProposalService({
      pendingAllocations,
      resolveRecentEntry: vi.fn(async () => entry),
      getEffectiveAmount: vi.fn(async () => 2150)
    });
    const createIds = vi.fn(() => ({ actionId: "allocation-action-1", allocationId: "allocation-1" }));

    const result = await service.propose({
      request, conversationKey: JSON.stringify([request.userId, request.conversationId]), classification, createIds
    });

    expect(result?.message).toContain("$21.50 entry");
    expect(result?.message).toContain("Please confirm this goal allocation");
    expect(result?.decision.toolCall).toMatchObject({
      name: "createSavingsGoalAllocation", actionId: "allocation-action-1", requiresApproval: true,
      arguments: { userId: request.userId, savingsEntryId: "entry-1", amountCents: 2150, goalName: "emergency fund" }
    });
    expect(pendingAllocations.getForConversation(request.userId, JSON.stringify([request.userId, request.conversationId]))?.actionId)
      .toBe("allocation-action-1");
  });

  it("fails closed when the current entry amount cannot be verified", async () => {
    const pendingAllocations = new PendingGoalAllocationService();
    const service = new PendingGoalAllocationProposalService({
      pendingAllocations,
      resolveRecentEntry: vi.fn(async () => entry),
      getEffectiveAmount: vi.fn(async () => { throw new Error("unavailable"); })
    });
    const createIds = vi.fn(() => ({ actionId: "unused", allocationId: "unused" }));

    const result = await service.propose({
      request, conversationKey: JSON.stringify([request.userId, request.conversationId]), classification, createIds
    });

    expect(result?.message).toContain("couldn't verify the current amount");
    expect(result?.decision.action).toBe("ask_follow_up");
    expect(createIds).not.toHaveBeenCalled();
    expect(pendingAllocations.getForConversation(request.userId, JSON.stringify([request.userId, request.conversationId])))
      .toBeUndefined();
  });

  it("does not create an allocation when the reference is not a user-owned recent entry", async () => {
    const createIds = vi.fn(() => ({ actionId: "unused", allocationId: "unused" }));
    const service = new PendingGoalAllocationProposalService({
      pendingAllocations: new PendingGoalAllocationService(),
      resolveRecentEntry: vi.fn(async () => undefined),
      getEffectiveAmount: vi.fn(async () => 2000)
    });

    const result = await service.propose({
      request, conversationKey: JSON.stringify([request.userId, request.conversationId]), classification, createIds
    });

    expect(result).toBeUndefined();
    expect(createIds).not.toHaveBeenCalled();
  });
});
