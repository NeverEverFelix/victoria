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
      turnId: "turn-current",
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

  it("completes a running turn from an action receipt without invoking the agent again", async () => {
    const base = new InMemoryTurnRepository();
    await base.accept(createTurn("turn-action-receipt", "user-a", "chat-a", "Yes"));
    const running = await base.compareAndTransition({
      userId: "user-a", conversationId: "chat-a", turnId: "turn-action-receipt", expectedRevision: 0,
      transition: { type: "start", at: "2026-10-27T12:00:01.000Z" }
    });
    const receipt = {
      message: "Done. I recorded $12.00 in your Victoria savings ledger. No real money has moved.",
      decision: {
        action: "create_ledger_entry" as const,
        classification: {
          type: "avoided_spend" as const, summary: "Skipped a purchase", confidence: 1, needsClarification: false
        },
        userFacingMessage: "Done. I recorded $12.00 in your Victoria savings ledger. No real money has moved."
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
    const respond = vi.fn();
    const process = createQueuedTurnProcessor({ turns, agent: { respond } as never, now: () => "2026-10-27T12:00:02.000Z" });

    await expect(process({ userId: "user-a", conversationId: "chat-a", turnId: running.id }))
      .resolves.toMatchObject({ status: "completed", turnId: running.id, response: receipt });
    expect(respond).not.toHaveBeenCalled();
    expect(await base.get("user-a", "chat-a", running.id)).toMatchObject({
      status: "completed", resultId: running.id, resultPayload: receipt
    });
  });

  it("recovers a failed turn that retained an atomically committed action receipt", async () => {
    const base = new InMemoryTurnRepository();
    await base.accept(createTurn("turn-failed-action-receipt", "user-a", "chat-a", "Yes"));
    const running = await base.compareAndTransition({
      userId: "user-a", conversationId: "chat-a", turnId: "turn-failed-action-receipt", expectedRevision: 0,
      transition: { type: "start", at: "2026-10-27T12:00:01.000Z" }
    });
    await base.compareAndTransition({
      userId: "user-a", conversationId: "chat-a", turnId: running.id, expectedRevision: running.revision,
      transition: { type: "fail", at: "2026-10-27T12:00:02.000Z", failureCode: "post_action_completion_failed" }
    });
    const receipt = {
      message: "Done. I recorded $12.00 in your Victoria savings ledger. No real money has moved.",
      decision: {
        action: "create_ledger_entry" as const,
        classification: {
          type: "avoided_spend" as const, summary: "Skipped a purchase", confidence: 1, needsClarification: false
        },
        userFacingMessage: "Done. I recorded $12.00 in your Victoria savings ledger. No real money has moved."
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
    const times = ["2026-10-27T12:00:03.000Z", "2026-10-27T12:00:04.000Z", "2026-10-27T12:00:05.000Z"];
    const respond = vi.fn();
    const process = createQueuedTurnProcessor({ turns, agent: { respond } as never, now: () => times.shift()! });

    await expect(process({ userId: "user-a", conversationId: "chat-a", turnId: running.id }))
      .resolves.toMatchObject({ status: "completed", response: receipt });
    expect(respond).not.toHaveBeenCalled();
    expect(await base.get("user-a", "chat-a", running.id)).toMatchObject({
      status: "completed", attempt: 2, resultPayload: receipt
    });
  });

  it("retries a transient durable result write without invoking the agent twice", async () => {
    const turns = new InMemoryTurnRepository();
    await turns.accept(createTurn("turn-complete-retry", "user-a", "chat-a", "Hello"));
    const complete = turns.compareAndTransition.bind(turns);
    let completionWrites = 0;
    vi.spyOn(turns, "compareAndTransition").mockImplementation(async (input) => {
      if (input.transition.type === "complete" && completionWrites++ === 0) {
        throw new Error("temporary result-store outage");
      }
      return complete(input);
    });
    const response = {
      message: "Hello there.",
      decision: { action: "reflect" as const, classification: { type: "general_finance" as const, summary: "Hello" } }
    };
    const respond = vi.fn(async () => response);
    const times = ["2026-10-27T12:00:01.000Z", "2026-10-27T12:00:02.000Z"];
    const process = createQueuedTurnProcessor({ turns, agent: { respond } as never, now: () => times.shift()! });

    await expect(process({ userId: "user-a", conversationId: "chat-a", turnId: "turn-complete-retry" }))
      .resolves.toMatchObject({ status: "completed", response });
    expect(respond).toHaveBeenCalledOnce();
    expect(await turns.get("user-a", "chat-a", "turn-complete-retry"))
      .toMatchObject({ status: "completed", resultPayload: response });
  });

  it("recognizes a committed result when the database acknowledgement was lost", async () => {
    const turns = new InMemoryTurnRepository();
    await turns.accept(createTurn("turn-commit-ack-lost", "user-a", "chat-a", "Hello"));
    const complete = turns.compareAndTransition.bind(turns);
    let completionWrites = 0;
    vi.spyOn(turns, "compareAndTransition").mockImplementation(async (input) => {
      if (input.transition.type === "complete" && completionWrites++ === 0) {
        await complete(input);
        throw new Error("database committed but acknowledgement was lost");
      }
      return complete(input);
    });
    const response = {
      message: "Hello there.",
      decision: { action: "reflect" as const, classification: { type: "general_finance" as const, summary: "Hello" } }
    };
    const respond = vi.fn(async () => response);
    const times = ["2026-10-27T12:00:01.000Z", "2026-10-27T12:00:02.000Z"];
    const process = createQueuedTurnProcessor({ turns, agent: { respond } as never, now: () => times.shift()! });

    await expect(process({ userId: "user-a", conversationId: "chat-a", turnId: "turn-commit-ack-lost" }))
      .resolves.toMatchObject({ status: "completed", response });
    expect(respond).toHaveBeenCalledOnce();
    expect(await turns.get("user-a", "chat-a", "turn-commit-ack-lost"))
      .toMatchObject({ status: "completed", resultPayload: response });
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
