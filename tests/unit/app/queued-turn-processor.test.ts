import { describe, expect, it, vi } from "vitest";
import { createQueuedTurn } from "../../../src/domain/turns/lifecycle.js";
import { InMemoryTurnRepository } from "../../../src/app/turns/in-memory-turn-repository.js";
import { createQueuedTurnProcessor } from "../../../src/app/turns/queued-turn-processor.js";

describe("queued turn processor", () => {
  it("passes stable user-scoped source turns to the agent and completes the durable turn", async () => {
    const turns = new InMemoryTurnRepository();
    await turns.accept(createTurn("turn-previous", "user-a", "chat-a", "I like hiking."));
    await turns.compareAndTransition({
      userId: "user-a", conversationId: "chat-a", turnId: "turn-previous", expectedRevision: 0,
      transition: { type: "start", at: "2026-10-27T12:00:01.000Z" }
    });
    await turns.compareAndTransition({
      userId: "user-a", conversationId: "chat-a", turnId: "turn-previous", expectedRevision: 1,
      transition: { type: "complete", at: "2026-10-27T12:00:02.000Z", resultId: "result-previous" }
    });
    await turns.accept(createTurn("turn-current", "user-a", "chat-a", "I want to explore local trails.", "2026-10-27T12:00:03.000Z"));
    const respond = vi.fn(async () => ({
      message: "That sounds like a nice weekend plan.",
      decision: { action: "reflect" as const, classification: { type: "general_finance" as const, summary: "" }, userFacingMessage: "" }
    }));
    const times = ["2026-10-27T12:00:04.000Z", "2026-10-27T12:00:05.000Z"];
    const process = createQueuedTurnProcessor({ turns, agent: { respond } as never, now: () => times.shift()! });

    const result = await process({ userId: "user-a", conversationId: "chat-a", turnId: "turn-current" });

    expect(result.status).toBe("completed");
    expect(respond).toHaveBeenCalledWith({
      userId: "user-a", conversationId: "chat-a", message: "I want to explore local trails.",
      sourceTurnReferences: [
        { turnId: "turn-previous", userMessage: "I like hiking." },
        { turnId: "turn-current", userMessage: "I want to explore local trails." }
      ]
    });
    expect(await turns.get("user-a", "chat-a", "turn-current")).toMatchObject({
      status: "completed", resultId: "turn-current", resultPayload: { message: "That sounds like a nice weekend plan." }
    });
    await expect(process({ userId: "user-a", conversationId: "chat-a", turnId: "turn-current" }))
      .resolves.toMatchObject({ status: "not_queued" });
  });

  it("does not invoke the agent when a turn is missing or belongs to another user", async () => {
    const turns = new InMemoryTurnRepository();
    await turns.accept(createTurn("turn-user-a", "user-a", "chat-a", "Hello"));
    const respond = vi.fn();
    const process = createQueuedTurnProcessor({ turns, agent: { respond } as never });

    await expect(process({ userId: "user-b", conversationId: "chat-a", turnId: "turn-user-a" }))
      .resolves.toMatchObject({ status: "not_queued" });
    expect(respond).not.toHaveBeenCalled();
  });

  it("uses the turn revision as a single-worker claim under concurrent processing", async () => {
    const turns = new InMemoryTurnRepository();
    await turns.accept(createTurn("turn-race", "user-a", "chat-a", "I like quiet weekends."));
    let release!: () => void;
    const waiting = new Promise<void>((resolve) => { release = resolve; });
    const respond = vi.fn(async () => {
      await waiting;
      return {
        message: "That sounds restful.",
        decision: { action: "reflect" as const, classification: { type: "general_finance" as const, summary: "" }, userFacingMessage: "" }
      };
    });
    const times = [
      "2026-10-27T12:00:01.000Z", "2026-10-27T12:00:02.000Z", "2026-10-27T12:00:03.000Z"
    ];
    const process = createQueuedTurnProcessor({ turns, agent: { respond } as never, now: () => times.shift()! });

    const first = process({ userId: "user-a", conversationId: "chat-a", turnId: "turn-race" });
    await vi.waitFor(() => expect(respond).toHaveBeenCalledTimes(1));
    const second = await process({ userId: "user-a", conversationId: "chat-a", turnId: "turn-race" });
    release();
    const firstResult = await first;

    expect(second).toEqual({ status: "already_claimed", turnId: "turn-race" });
    expect(firstResult.status).toBe("completed");
    expect(respond).toHaveBeenCalledTimes(1);
  });

  it("marks provider failures failed without retrying them implicitly", async () => {
    const turns = new InMemoryTurnRepository();
    await turns.accept(createTurn("turn-fails", "user-a", "chat-a", "Hello"));
    const respond = vi.fn(async () => { throw new Error("provider unavailable"); });
    const times = ["2026-10-27T12:00:01.000Z", "2026-10-27T12:00:02.000Z"];
    const process = createQueuedTurnProcessor({ turns, agent: { respond } as never, now: () => times.shift()! });

    await expect(process({ userId: "user-a", conversationId: "chat-a", turnId: "turn-fails" }))
      .rejects.toThrow("provider unavailable");
    expect(await turns.get("user-a", "chat-a", "turn-fails")).toMatchObject({
      status: "failed", failureCode: "queued_turn_processing_failed"
    });
    expect(await process({ userId: "user-a", conversationId: "chat-a", turnId: "turn-fails" }))
      .toMatchObject({ status: "not_queued" });
    expect(respond).toHaveBeenCalledTimes(1);
  });
});

function createTurn(
  id: string, userId: string, conversationId: string, userMessage: string,
  acceptedAt = "2026-10-27T12:00:00.000Z"
) {
  return createQueuedTurn({
    id, userId, conversationId, idempotencyKey: `key-${id}`, userMessage,
    requestFingerprint: `fingerprint-${id}`, acceptedAt
  });
}
