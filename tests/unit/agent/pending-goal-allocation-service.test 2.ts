import { describe, expect, it } from "vitest";
import { PendingGoalAllocationService } from "../../../src/agent/pending-goal-allocation-service.js";
import type { AgentDecision } from "../../../src/agent/types.js";

describe("PendingGoalAllocationService", () => {
  it("isolates proposals by user and exact conversation key", () => {
    const service = new PendingGoalAllocationService();
    const state = pending("user-a", "[\"user-a\",\"chat:a\"]");
    service.set("action-a", state);

    expect(service.getForConversation("user-a", state.conversationKey)?.actionId).toBe("action-a");
    expect(service.getForConversation("user-b", state.conversationKey)).toBeUndefined();
    expect(service.getForConversation("user-a", "[\"user-a\",\"chat\",\"a\"]")).toBeUndefined();
    expect(service.getByAction("user-b", "action-a")).toBeUndefined();
  });

  it("expires only the matching proposal when its caller confirms expiry", () => {
    const service = new PendingGoalAllocationService();
    const state = pending("user-a", "conversation-a", "2026-10-29T00:00:00.000Z");
    service.set("action-a", state);

    expect(service.expireForConversation("user-b", state.conversationKey, () => true)).toBeUndefined();
    expect(service.getForConversation("user-a", state.conversationKey)?.actionId).toBe("action-a");
    expect(service.expireForConversation("user-a", state.conversationKey, () => true)).toEqual(state);
    expect(service.getForConversation("user-a", state.conversationKey)).toBeUndefined();
  });

  it("replaces the current proposal without leaving the prior action addressable", () => {
    const service = new PendingGoalAllocationService();
    const first = pending("user-a", "conversation-a");
    const replacement = pending("user-a", "conversation-a");
    service.set("action-a", first);
    service.set("action-b", replacement);

    expect(service.getForConversation("user-a", first.conversationKey)?.actionId).toBe("action-b");
    expect(service.getByAction("user-a", "action-a")).toBeUndefined();
  });

  it("keeps an exact retry approval on the same proposal", () => {
    const service = new PendingGoalAllocationService();
    const state = pending("user-a", "conversation-a");
    service.set("action-a", state);
    const approval = { id: "approval-a", userId: "user-a", actionId: "action-a", approvedAt: "2026-10-30T00:00:00.000Z", source: "user_message" as const };

    expect(service.setApproval("user-b", "action-a", approval)).toBe(false);
    expect(service.setApproval("user-a", "action-a", approval)).toBe(true);
    expect(service.getForConversation("user-a", state.conversationKey)).toEqual({
      actionId: "action-a", state: { ...state, approval }
    });
  });
});

function pending(userId: string, conversationKey: string, createdAt = "2026-10-30T00:00:00.000Z") {
  return {
    userId,
    conversationKey,
    decision: { goalAllocation: { createdAt } } as AgentDecision
  };
}
