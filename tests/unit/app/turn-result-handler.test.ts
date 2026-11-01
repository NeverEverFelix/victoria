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

  it("finalizes an approved-action receipt when the owner polls an interrupted running turn", async () => {
    const base = new InMemoryTurnRepository();
    await base.accept(createQueuedTurn({
      id: "turn-with-receipt", userId: "user-a", conversationId: "chat-a", idempotencyKey: "key-receipt",
      userMessage: "Yes", requestFingerprint: "fingerprint-receipt", acceptedAt: "2026-10-27T12:00:00.000Z"
    }));
    const running = await base.compareAndTransition({
      userId: "user-a", conversationId: "chat-a", turnId: "turn-with-receipt", expectedRevision: 0,
      transition: { type: "start", at: "2026-10-27T12:00:01.000Z" }
    });
    const receipt = {
      message: "Done. I recorded $12.00 in your Victoria savings ledger. No real money has moved yet.",
      decision: {
        action: "create_ledger_entry" as const,
        classification: {
          type: "avoided_spend" as const, summary: "Skipped a purchase", confidence: 1, needsClarification: false
        },
        userFacingMessage: "Done. I recorded $12.00 in your Victoria savings ledger. No real money has moved yet."
      }
    };
    const turns = {
      accept: base.accept.bind(base),
      listConversation: base.listConversation.bind(base),
      compareAndTransition: base.compareAndTransition.bind(base),
      get: async (userId: string, conversationId: string, turnId: string) => {
        const current = await base.get(userId, conversationId, turnId);
        return current?.id === running.id ? { ...current, resultPayload: receipt } : current;
      }
    };
    const handler = createTurnResultHandler({ authenticate: async () => ({ userId: "user-a" }), turns });

    const response = await handler(new Request("https://victoria.local"), {
      conversationId: "chat-a", turnId: running.id
    });

    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({
      turnId: running.id,
      status: "completed",
      result: {
        message: receipt.message,
        decision: { action: "create_ledger_entry", classification: { type: "avoided_spend", summary: "Skipped a purchase" } }
      }
    });
    expect(await base.get("user-a", "chat-a", running.id)).toMatchObject({ status: "completed", resultPayload: receipt });
  });
});
