import { describe, expect, it } from "vitest";
import { createQueuedTurn } from "../../../src/domain/turns/lifecycle.js";
import { InMemoryTurnRepository } from "../../../src/app/turns/in-memory-turn-repository.js";
import { createTurnResultHandler } from "../../../src/app/http/turn-result-handler.js";

describe("turn result HTTP boundary", () => {
  it("returns a completed response only to its authenticated owner and conversation", async () => {
    const turns = new InMemoryTurnRepository();
    await turns.accept(createQueuedTurn({
      id: "turn-1", userId: "user-a", conversationId: "chat-a", idempotencyKey: "key-1",
      userMessage: "Hello", requestFingerprint: "fingerprint-1", acceptedAt: "2026-10-27T12:00:00.000Z"
    }));
    await turns.compareAndTransition({ userId: "user-a", conversationId: "chat-a", turnId: "turn-1", expectedRevision: 0,
      transition: { type: "start", at: "2026-10-27T12:00:01.000Z" } });
    const result = { message: "Hi there.", decision: {
      action: "reflect", classification: { type: "general_finance", summary: "Hello" }, proposal: { id: "internal-proposal" }
    } };
    await turns.compareAndTransition({ userId: "user-a", conversationId: "chat-a", turnId: "turn-1", expectedRevision: 1,
      transition: { type: "complete", at: "2026-10-27T12:00:02.000Z", resultId: "turn-1", resultPayload: result } });
    const handler = createTurnResultHandler({ authenticate: async (request) => {
      const userId = request.headers.get("x-user");
      return userId ? { userId } : null;
    }, turns });

    const response = await handler(new Request("https://victoria.local", { headers: { "x-user": "user-a" } }), {
      conversationId: "chat-a", turnId: "turn-1"
    });
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ turnId: "turn-1", status: "completed", result: {
      message: "Hi there.", decision: { action: "reflect", classification: { type: "general_finance", summary: "Hello" } }
    } });

    const hidden = await handler(new Request("https://victoria.local", { headers: { "x-user": "user-b" } }), {
      conversationId: "chat-a", turnId: "turn-1"
    });
    expect(hidden.status).toBe(404);
  });

  it("returns only state while a turn is pending and does not expose failure details", async () => {
    const turns = new InMemoryTurnRepository();
    await turns.accept(createQueuedTurn({
      id: "turn-pending", userId: "user-a", conversationId: "chat-a", idempotencyKey: "key-2",
      userMessage: "Hello", requestFingerprint: "fingerprint-2", acceptedAt: "2026-10-27T12:00:00.000Z"
    }));
    const handler = createTurnResultHandler({ authenticate: async () => ({ userId: "user-a" }), turns });
    const response = await handler(new Request("https://victoria.local"), { conversationId: "chat-a", turnId: "turn-pending" });
    expect(await response.json()).toEqual({ turnId: "turn-pending", status: "queued" });
  });
});
