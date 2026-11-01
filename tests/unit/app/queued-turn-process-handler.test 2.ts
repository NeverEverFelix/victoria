import { describe, expect, it, vi } from "vitest";
import { createQueuedTurnProcessHandler } from "../../../src/app/http/queued-turn-process-handler.js";

describe("queued turn process HTTP boundary", () => {
  it("uses authenticated identity and returns only public response fields", async () => {
    const process = vi.fn(async () => ({
      status: "completed" as const, turnId: "turn-1",
      response: {
        message: "You made time for a walk.",
        decision: {
          action: "reflect" as const,
          classification: { type: "general_finance" as const, summary: "walk", confidence: 0.9, needsClarification: false },
          proposal: {
            id: "private-proposal", eventId: "event-1", userId: "user-a", actionId: "action-1",
            suggestion: { id: "suggestion-1", amountCents: 100, currency: "USD" as const, reason: "test", source: "user_provided" as const, movementMode: "mock_ledger" as const },
            createdAt: "2026-10-27T00:00:00.000Z", status: "pending" as const
          }, userFacingMessage: "private"
        }
      }
    }));
    const handler = createQueuedTurnProcessHandler({
      authenticate: async () => ({ userId: "user-a" }), process
    });
    const response = await handler(new Request("https://victoria.local", { method: "POST" }), {
      conversationId: "chat-a", turnId: "turn-1"
    });

    expect(response.status).toBe(200);
    expect(process).toHaveBeenCalledWith({ userId: "user-a", conversationId: "chat-a", turnId: "turn-1" });
    expect(await response.json()).toEqual({
      turnId: "turn-1", status: "completed",
      result: { message: "You made time for a walk.", decision: {
        action: "reflect", classification: { type: "general_finance", summary: "walk" }
      } }
    });
  });

  it("rejects unauthenticated processing and keeps conflicts distinct from provider failures", async () => {
    const process = vi.fn(async () => ({ status: "already_claimed" as const, turnId: "turn-1" }));
    const handler = createQueuedTurnProcessHandler({ authenticate: async () => null, process });
    const denied = await handler(new Request("https://victoria.local", { method: "POST" }), {
      conversationId: "chat-a", turnId: "turn-1"
    });
    expect(denied.status).toBe(401);
    expect(process).not.toHaveBeenCalled();

    const authenticated = createQueuedTurnProcessHandler({ authenticate: async () => ({ userId: "user-a" }), process });
    const conflict = await authenticated(new Request("https://victoria.local", { method: "POST" }), {
      conversationId: "chat-a", turnId: "turn-1"
    });
    expect(conflict.status).toBe(202);
    expect(await conflict.json()).toEqual({ turnId: "turn-1", status: "already_claimed" });
  });
});
