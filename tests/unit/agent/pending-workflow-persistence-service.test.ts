import { describe, expect, it, vi } from "vitest";
import type { AgentDecision } from "../../../src/agent/types.js";
import { PendingWorkflowPersistenceService } from "../../../src/agent/pending-workflow-persistence-service.js";
import { PendingSavingsProposalService } from "../../../src/agent/pending-savings-proposal-service.js";
import { PendingGoalAllocationService } from "../../../src/agent/pending-goal-allocation-service.js";
import { PendingEntryCorrectionService } from "../../../src/agent/pending-entry-correction-service.js";

function makePersistence(input: {
  readonly savingsStore?: ConstructorParameters<typeof PendingWorkflowPersistenceService>[0]["savingsStore"];
  readonly savings?: PendingSavingsProposalService;
}) {
  const savings = input.savings ?? new PendingSavingsProposalService();
  return {
    savings,
    persistence: new PendingWorkflowPersistenceService({
      ...(input.savingsStore ? { savingsStore: input.savingsStore } : {}),
      savings,
      goalAllocations: new PendingGoalAllocationService(),
      corrections: new PendingEntryCorrectionService()
    })
  };
}

describe("PendingWorkflowPersistenceService", () => {
  it("restores only a pending savings decision scoped to the authenticated user", async () => {
    const decision = {
      action: "suggest_savings",
      classification: { type: "avoided_spend" },
      toolCall: { name: "createSavingsEntry", actionId: "action-other-user", arguments: {}, requiresApproval: true },
      proposal: { id: "proposal-1", actionId: "action-other-user", userId: "other-user", status: "pending", createdAt: new Date().toISOString() },
      savingsEvent: { id: "event-1", userId: "other-user" },
      userFacingMessage: "Confirm?"
    } as unknown as AgentDecision;
    const store = { getPending: vi.fn(async () => ({ actionId: "action-other-user", decision })), commit: vi.fn() };
    const { savings, persistence } = makePersistence({ savingsStore: store });

    await persistence.restoreSavings({ userId: "current-user", conversationId: "chat", message: "yes" });

    expect(store.getPending).toHaveBeenCalledExactlyOnceWith("current-user", "chat");
    expect(savings.getForConversation("current-user", JSON.stringify(["current-user", "chat"]))).toBeUndefined();
  });

  it("expires an old proposal only in the exact user and conversation scope", () => {
    const savings = new PendingSavingsProposalService();
    const decision = {
      action: "suggest_savings", classification: { type: "avoided_spend" },
      proposal: { id: "proposal-1", actionId: "action-1", userId: "user-a", status: "pending", createdAt: "2020-01-01T00:00:00.000Z" },
      userFacingMessage: "Confirm?"
    } as unknown as AgentDecision;
    savings.set("action-1", {
      userId: "user-a", conversationKey: JSON.stringify(["user-a", "chat-a"]), decision
    });
    const { persistence } = makePersistence({ savings });

    persistence.expireForRequest({ userId: "user-a", conversationId: "chat-a", message: "yes" });

    expect(savings.getForConversation("user-a", JSON.stringify(["user-a", "chat-a"]))).toBeUndefined();
  });
});
