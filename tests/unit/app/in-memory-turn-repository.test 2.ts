import { describe, expect, it } from "vitest";
import { createQueuedTurn } from "../../../src/domain/turns/lifecycle.js";
import {
  InMemoryTurnRepository,
  TurnNotFoundError,
  TurnRepositoryConflictError,
  TurnRevisionConflictError
} from "../../../src/app/index.js";

function queuedTurn(options: { id?: string; userId?: string; conversationId?: string; key?: string; fingerprint?: string } = {}) {
  return createQueuedTurn({
    id: options.id ?? "turn-1",
    userId: options.userId ?? "user-1",
    conversationId: options.conversationId ?? "conversation-1",
    idempotencyKey: options.key ?? "request-1",
    userMessage: "I skipped a purchase.",
    requestFingerprint: options.fingerprint ?? "fingerprint-1",
    acceptedAt: "2026-10-05T12:00:00.000Z"
  });
}

describe("InMemoryTurnRepository", () => {
  it("creates once and replays the original turn for the same user request", async () => {
    const repository = new InMemoryTurnRepository();
    const created = await repository.accept(queuedTurn());
    const replayed = await repository.accept(queuedTurn({ id: "new-generated-id" }));

    expect(created.disposition).toBe("created");
    expect(replayed.disposition).toBe("replayed");
    expect(replayed.turn.id).toBe("turn-1");
    expect(replayed.turn).toBe(created.turn);
    expect(Object.isFrozen(replayed.turn)).toBe(true);
  });

  it("rejects a reused user idempotency key for different request content or conversation", async () => {
    const repository = new InMemoryTurnRepository();
    await repository.accept(queuedTurn());

    await expect(repository.accept(queuedTurn({ id: "turn-2", fingerprint: "different" })))
      .rejects.toBeInstanceOf(TurnRepositoryConflictError);
    await expect(repository.accept(queuedTurn({ id: "turn-3", conversationId: "conversation-2" })))
      .rejects.toBeInstanceOf(TurnRepositoryConflictError);
  });

  it("scopes idempotency and reads by user and conversation", async () => {
    const repository = new InMemoryTurnRepository();
    await repository.accept(queuedTurn());
    const otherUserTurn = await repository.accept(queuedTurn({ id: "turn-2", userId: "user-2" }));

    expect(otherUserTurn.disposition).toBe("created");
    expect(await repository.get("user-1", "conversation-1", "turn-1")).toMatchObject({ userId: "user-1" });
    expect(await repository.get("user-2", "conversation-1", "turn-1")).toBeNull();
    expect(await repository.get("user-1", "other-conversation", "turn-1")).toBeNull();
  });

  it("applies a compare-and-transition once and rejects stale revisions", async () => {
    const repository = new InMemoryTurnRepository();
    await repository.accept(queuedTurn());
    const input = {
      userId: "user-1",
      conversationId: "conversation-1",
      turnId: "turn-1",
      expectedRevision: 0,
      transition: { type: "start" as const, at: "2026-10-05T12:00:01.000Z" }
    };

    const results = await Promise.allSettled([
      repository.compareAndTransition(input),
      repository.compareAndTransition(input)
    ]);
    expect(results.filter((result) => result.status === "fulfilled")).toHaveLength(1);
    expect(results.filter((result) => result.status === "rejected" && result.reason instanceof TurnRevisionConflictError)).toHaveLength(1);
    expect(await repository.get("user-1", "conversation-1", "turn-1")).toMatchObject({ status: "running", revision: 1 });
  });

  it("does not reveal or transition a turn outside its user and conversation scope", async () => {
    const repository = new InMemoryTurnRepository();
    await repository.accept(queuedTurn());

    await expect(repository.compareAndTransition({
      userId: "user-2",
      conversationId: "conversation-1",
      turnId: "turn-1",
      expectedRevision: 0,
      transition: { type: "start", at: "2026-10-05T12:00:01.000Z" }
    })).rejects.toBeInstanceOf(TurnNotFoundError);
  });
});
