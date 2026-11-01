import { describe, expect, it } from "vitest";
import { PendingEntryCorrectionService } from "../../../src/agent/pending-entry-correction-service.js";
import type { AgentDecision } from "../../../src/agent/types.js";

describe("PendingEntryCorrectionService", () => {
  it("isolates corrections by user and exact conversation key", () => {
    const service = new PendingEntryCorrectionService();
    const state = pending("user-a", "[\"user-a\",\"chat:a\"]");
    service.set("action-a", state);

    expect(service.getForConversation("user-a", state.conversationKey)?.actionId).toBe("action-a");
    expect(service.getForConversation("user-b", state.conversationKey)).toBeUndefined();
    expect(service.getForConversation("user-a", "[\"user-a\",\"chat\",\"a\"]")).toBeUndefined();
    expect(service.getByAction("user-b", "action-a")).toBeUndefined();
  });

  it("expires only the matching user's pending correction", () => {
    const service = new PendingEntryCorrectionService();
    const state = pending("user-a", "conversation-a", "2026-10-29T00:00:00.000Z");
    service.set("action-a", state);

    expect(service.expireForConversation("user-b", state.conversationKey, () => true)).toBeUndefined();
    expect(service.getForConversation("user-a", state.conversationKey)?.actionId).toBe("action-a");
    expect(service.expireForConversation("user-a", state.conversationKey, () => false)).toBeUndefined();
    expect(service.expireForConversation("user-a", state.conversationKey, () => true)).toEqual(state);
    expect(service.getForConversation("user-a", state.conversationKey)).toBeUndefined();
  });

  it("clears only the exact conversation index when deleting by action", () => {
    const service = new PendingEntryCorrectionService();
    const first = pending("user-a", "conversation-a");
    const second = pending("user-a", "conversation-b");
    service.set("action-a", first);
    service.set("action-b", second);

    expect(service.deleteByAction("action-a")).toEqual(first);
    expect(service.getForConversation("user-a", first.conversationKey)).toBeUndefined();
    expect(service.getForConversation("user-a", second.conversationKey)?.actionId).toBe("action-b");
  });

  it("does not leave a superseded action addressable when a conversation gets a fresh proposal", () => {
    const service = new PendingEntryCorrectionService();
    const first = pending("user-a", "conversation-a");
    const replacement = pending("user-a", "conversation-a");
    service.set("action-a", first);
    service.set("action-b", replacement);

    expect(service.getForConversation("user-a", first.conversationKey)?.actionId).toBe("action-b");
    expect(service.getByAction("user-a", "action-a")).toBeUndefined();
  });

  it("updates retry identity without changing the proposal", () => {
    const service = new PendingEntryCorrectionService();
    const state = pending("user-a", "conversation-a");
    service.set("action-a", state);

    expect(service.setApprovalId("user-a", "action-a", "approval-a")).toBe(true);
    expect(service.getForConversation("user-a", state.conversationKey)).toEqual({
      actionId: "action-a", state: { ...state, approvalId: "approval-a" }
    });
    expect(service.setApprovalId("user-b", "action-a", "approval-b")).toBe(false);
  });
});

function pending(userId: string, conversationKey: string, createdAt = "2026-10-30T00:00:00.000Z") {
  return {
    userId,
    conversationKey,
    decision: { entryCorrection: { createdAt } } as AgentDecision
  };
}
