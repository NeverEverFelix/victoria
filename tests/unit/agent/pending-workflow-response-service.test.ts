import { describe, expect, it, vi } from "vitest";
import { PendingEntryCorrectionService } from "../../../src/agent/pending-entry-correction-service.js";
import { PendingGoalAllocationService } from "../../../src/agent/pending-goal-allocation-service.js";
import { PendingWorkflowResponseService } from "../../../src/agent/pending-workflow-response-service.js";
import type { AgentDecision, AgentRequest, AgentResponse } from "../../../src/agent/types.js";

const request: AgentRequest = {
  userId: "user-1",
  conversationId: "conversation-1",
  message: "Yes"
};

function correctionDecision(): AgentDecision {
  return {
    action: "ask_follow_up",
    classification: { type: "general_finance", confidence: 1, summary: "correction", needsClarification: false },
    entryCorrection: {
      id: "correction-1", userId: "user-1", savingsEntryId: "entry-1", correctedAmountCents: 2400,
      adjustmentCents: -300, reason: "user correction", status: "pending", createdAt: "2026-10-30T12:00:00Z"
    },
    userFacingMessage: "Confirm the correction?"
  };
}

function goalDecision(): AgentDecision {
  return {
    action: "ask_follow_up",
    classification: { type: "general_finance", confidence: 1, summary: "goal allocation", needsClarification: false },
    goalAllocation: {
      id: "allocation-1", userId: "user-1", savingsEntryId: "entry-1", goalName: "Emergency fund",
      amountCents: 2400, status: "pending", createdAt: "2026-10-30T12:00:00Z"
    },
    userFacingMessage: "Confirm the allocation?"
  };
}

function response(message = "handled"): AgentResponse {
  return {
    message,
    decision: {
      action: "reflect",
      classification: { type: "general_finance", confidence: 1, summary: message, needsClarification: false },
      userFacingMessage: message
    }
  };
}

describe("PendingWorkflowResponseService", () => {
  it("passes the exact correction action to the deterministic approval callback", async () => {
    const corrections = new PendingEntryCorrectionService();
    const goals = new PendingGoalAllocationService();
    corrections.set("action-correction", {
      userId: request.userId, conversationKey: JSON.stringify([request.userId, request.conversationId]),
      decision: correctionDecision()
    });
    const approveEntryCorrection = vi.fn(async (approvedRequest: AgentRequest) => response(approvedRequest.approvedActionId));
    const service = new PendingWorkflowResponseService({
      corrections, goalAllocations: goals, conversationResponderEnabled: false,
      callbacks: {
        approveEntryCorrection,
        approveGoalAllocation: vi.fn(async () => response()),
        learnFromReadOnlyTopicTurn: vi.fn(async () => undefined),
        respondConversationalTurn: vi.fn(async () => response())
      }
    });

    const result = await service.resolveEntryCorrection(request, []);

    expect(approveEntryCorrection).toHaveBeenCalledWith(
      expect.objectContaining({ approvedActionId: "action-correction" }), correctionDecision()
    );
    expect(result).toMatchObject({ kind: "handled", workflow: "entry_correction", resolution: "approval" });
    expect(result.kind === "handled" ? result.response.message : undefined).toBe("action-correction");
    expect(corrections.getForConversation(request.userId, JSON.stringify([request.userId, request.conversationId]))).toBeDefined();
  });

  it("declines a correction without invoking approval and removes only its pending action", async () => {
    const corrections = new PendingEntryCorrectionService();
    const conversationKey = JSON.stringify([request.userId, request.conversationId]);
    corrections.set("action-correction", {
      userId: request.userId, conversationKey, decision: correctionDecision()
    });
    const approveEntryCorrection = vi.fn(async () => response());
    const service = new PendingWorkflowResponseService({
      corrections, goalAllocations: new PendingGoalAllocationService(), conversationResponderEnabled: false,
      callbacks: {
        approveEntryCorrection, approveGoalAllocation: vi.fn(async () => response()),
        learnFromReadOnlyTopicTurn: vi.fn(async () => undefined),
        respondConversationalTurn: vi.fn(async () => response())
      }
    });

    const result = await service.resolveEntryCorrection({ ...request, message: "No" }, []);

    expect(result).toMatchObject({ kind: "handled", workflow: "entry_correction", resolution: "decline" });
    expect(result.kind === "handled" ? result.response.message : undefined).toContain("remains unchanged");
    expect(approveEntryCorrection).not.toHaveBeenCalled();
    expect(corrections.getForConversation(request.userId, conversationKey)).toBeUndefined();
  });

  it("answers a read-only goal topic while preserving the pending allocation", async () => {
    const goals = new PendingGoalAllocationService();
    const conversationKey = JSON.stringify([request.userId, request.conversationId]);
    goals.set("action-goal", {
      userId: request.userId, conversationKey, decision: goalDecision()
    });
    const approveGoalAllocation = vi.fn(async () => response());
    const respondConversationalTurn = vi.fn(async (_request, _turns, _baseline, pendingAction) => response(pendingAction));
    const service = new PendingWorkflowResponseService({
      corrections: new PendingEntryCorrectionService(), goalAllocations: goals, conversationResponderEnabled: true,
      callbacks: {
        approveEntryCorrection: vi.fn(async () => response()), approveGoalAllocation,
        learnFromReadOnlyTopicTurn: vi.fn(async () => undefined), respondConversationalTurn
      }
    });

    const result = await service.resolveGoalAllocation({
      ...request, message: "Can we talk about dinner instead?"
    }, ["Victoria: Confirm the allocation?"]);

    expect(result).toMatchObject({ kind: "handled", workflow: "goal_allocation", resolution: "pending" });
    expect(result.kind === "handled" ? result.response.message : undefined).toBe("goal_allocation");
    expect(respondConversationalTurn).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Can we talk about dinner instead?" }),
      ["Victoria: Confirm the allocation?"], expect.stringContaining("remains pending"), "goal_allocation"
    );
    expect(approveGoalAllocation).not.toHaveBeenCalled();
    expect(goals.getForConversation(request.userId, conversationKey)?.actionId).toBe("action-goal");
  });

  it("sends an ambiguous goal confirmation to contextual interpretation without approving it", async () => {
    const goals = new PendingGoalAllocationService();
    const conversationKey = JSON.stringify([request.userId, request.conversationId]);
    goals.set("action-goal", {
      userId: request.userId, conversationKey, decision: goalDecision()
    });
    const approveGoalAllocation = vi.fn(async () => response());
    const respondConversationalTurn = vi.fn(async (_request, _turns, _baseline, pendingAction) => response(pendingAction));
    const service = new PendingWorkflowResponseService({
      corrections: new PendingEntryCorrectionService(), goalAllocations: goals, conversationResponderEnabled: true,
      callbacks: {
        approveEntryCorrection: vi.fn(async () => response()), approveGoalAllocation,
        learnFromReadOnlyTopicTurn: vi.fn(async () => undefined), respondConversationalTurn
      }
    });

    const result = await service.resolveGoalAllocation({ ...request, message: "Maybe" }, []);

    expect(result).toMatchObject({ kind: "handled", workflow: "goal_allocation", resolution: "pending" });
    expect(result.kind === "handled" ? result.response.message : undefined).toBe("goal_allocation");
    expect(respondConversationalTurn).toHaveBeenCalledWith(
      expect.objectContaining({ message: "Maybe" }), [], expect.stringContaining("couldn't tell"), "goal_allocation"
    );
    expect(approveGoalAllocation).not.toHaveBeenCalled();
    expect(goals.getForConversation(request.userId, conversationKey)?.actionId).toBe("action-goal");
  });
});
