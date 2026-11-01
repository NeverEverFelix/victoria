import { describe, expect, it, vi } from "vitest";
import type { SavingsEntry } from "../../../src/domain/savings/types.js";
import { PendingEntryCorrectionProposalService } from "../../../src/agent/pending-entry-correction-proposal-service.js";
import { PendingEntryCorrectionService } from "../../../src/agent/pending-entry-correction-service.js";
import type { AgentRequest, ClassifiedMessage } from "../../../src/agent/types.js";

const request: AgentRequest = { userId: "user-1", conversationId: "chat-1", message: "I avoided $18, not $20." };
const entry: SavingsEntry = {
  id: "entry-1", userId: "user-1", eventId: "event-1", proposalId: "proposal-1", approvalId: "approval-1",
  approvedActionId: "action-1", amountCents: 2000, currency: "USD", reason: "Original amount",
  movementMode: "mock_ledger", status: "completed", createdAt: "2026-10-30T12:00:00.000Z"
};

function classification(overrides: Partial<ClassifiedMessage> = {}): ClassifiedMessage {
  return {
    type: "entry_correction", confidence: 1, amountCents: 1800,
    summary: "Correct the recorded amount", needsClarification: false, ...overrides
  };
}

describe("PendingEntryCorrectionProposalService", () => {
  it("creates an exact approval-gated correction without changing the completed entry", async () => {
    const pendingCorrections = new PendingEntryCorrectionService();
    const service = new PendingEntryCorrectionProposalService({
      pendingCorrections,
      resolveRecentEntry: vi.fn(async () => entry),
      getEffectiveAmount: vi.fn(async () => 2000)
    });
    const createIds = vi.fn(() => ({ actionId: "correction-action-1", correctionId: "correction-1" }));
    const result = await service.propose({
      request, conversationKey: JSON.stringify([request.userId, request.conversationId]),
      classification: classification(), createIds
    });

    expect(result?.message).toContain("reduce the recorded amount by $2.00");
    expect(result?.decision.toolCall).toMatchObject({
      name: "createSavingsEntryCorrection", actionId: "correction-action-1", requiresApproval: true,
      arguments: { savingsEntryId: "entry-1", correctedAmountCents: 1800 }
    });
    expect(result?.decision.entryCorrection).toMatchObject({
      id: "correction-1", status: "pending", adjustmentCents: -200,
      savingsEntryId: "entry-1", correctedAmountCents: 1800
    });
    expect(createIds).toHaveBeenCalledExactlyOnceWith();
    expect(pendingCorrections.getForConversation(request.userId, JSON.stringify([request.userId, request.conversationId]))?.actionId)
      .toBe("correction-action-1");
  });

  it("does not allocate action identity or create state when the corrected amount is invalid", async () => {
    const pendingCorrections = new PendingEntryCorrectionService();
    const service = new PendingEntryCorrectionProposalService({
      pendingCorrections,
      resolveRecentEntry: vi.fn(async () => entry),
      getEffectiveAmount: vi.fn(async () => 2000)
    });
    const createIds = vi.fn(() => ({ actionId: "unused", correctionId: "unused" }));
    const invalidClassification: ClassifiedMessage = {
      type: "entry_correction", confidence: 1, amountIssue: "invalid_precision",
      summary: "Correct the recorded amount", needsClarification: true
    };

    const result = await service.propose({
      request, conversationKey: JSON.stringify([request.userId, request.conversationId]),
      classification: invalidClassification, createIds
    });

    expect(result?.message).toContain("more than two decimal places");
    expect(result?.decision.action).toBe("ask_follow_up");
    expect(createIds).not.toHaveBeenCalled();
    expect(pendingCorrections.getForConversation(request.userId, JSON.stringify([request.userId, request.conversationId])))
      .toBeUndefined();
  });

  it("asks for the correct target when scoped history does not return a user-owned entry", async () => {
    const service = new PendingEntryCorrectionProposalService({
      pendingCorrections: new PendingEntryCorrectionService(),
      resolveRecentEntry: vi.fn(async () => ({ ...entry, userId: "user-2" })),
      getEffectiveAmount: vi.fn(async () => 2000)
    });

    const result = await service.propose({
      request, conversationKey: JSON.stringify([request.userId, request.conversationId]),
      classification: classification(), createIds: vi.fn(() => ({ actionId: "unused", correctionId: "unused" }))
    });

    expect(result?.message).toContain("only match an entry from this conversation");
    expect(result?.decision.action).toBe("ask_follow_up");
  });
});
