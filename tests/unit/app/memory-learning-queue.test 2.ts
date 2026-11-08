import { describe, expect, it, vi } from "vitest";
import type { PostgresPool } from "../../../src/app/shared/postgres-types.js";
import { PostgresMemoryLearningQueue } from "../../../src/app/turns/memory-learning-queue.js";
import { createMemoryLearningProcessor } from "../../../src/app/turns/memory-learning-processor.js";
import { createMemoryLearningHandler } from "../../../src/app/http/memory-learning-handler.js";

describe("durable memory learning queue", () => {
  it("enqueues only a scoped running or completed turn and stores its identity", async () => {
    const query = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
      void sql; void values;
      return { rows: [{ turn_id: "turn-1" }], rowCount: 1 };
    });
    const queue = new PostgresMemoryLearningQueue({ query } as unknown as PostgresPool);
    expect(await queue.enqueue({ userId: "user-1", conversationId: "chat-1", turnId: "turn-1" })).toBe(true);
    expect(query.mock.calls[0]?.[0]).toContain("status IN ('running', 'completed')");
    expect(query.mock.calls[0]?.[0]).toContain("ON CONFLICT (turn_id) DO NOTHING");
    expect(query.mock.calls[0]?.[1]).toEqual(["turn-1", "user-1", "chat-1"]);
    expect(query.mock.calls[0]?.[0]).not.toContain("user_message");
  });

  it("claims only completed turns with a lease and compare-and-sets completion", async () => {
    const query = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
      void sql; void values;
      return { rows: [] as { turn_id: string; user_id: string; conversation_id: string; attempts: number }[], rowCount: 0 };
    })
      .mockResolvedValueOnce({ rows: [{ turn_id: "turn-1", user_id: "user-1", conversation_id: "chat-1", attempts: 1 }], rowCount: 1 })
      .mockResolvedValueOnce({ rows: [], rowCount: 1 });
    const queue = new PostgresMemoryLearningQueue({ query } as unknown as PostgresPool);
    const job = await queue.claim({ leaseToken: "lease-1" });
    expect(job).toEqual({ turnId: "turn-1", userId: "user-1", conversationId: "chat-1", attempts: 1, leaseToken: "lease-1" });
    expect(query.mock.calls[0]?.[0]).toContain("FOR UPDATE OF job SKIP LOCKED");
    expect(query.mock.calls[0]?.[0]).toContain("turn.status = 'completed'");
    expect(await queue.complete(job!)).toBe(true);
    expect(query.mock.calls[1]?.[1]).toEqual(["turn-1", "user-1", "chat-1", "lease-1"]);
  });

  it("retries content-free failures with bounded backoff and rejects unsafe lease settings", async () => {
    const query = vi.fn(async (sql: string, values: readonly unknown[] = []) => {
      void sql; void values;
      return { rows: [], rowCount: 1 };
    });
    const queue = new PostgresMemoryLearningQueue({ query } as unknown as PostgresPool);
    const result = await queue.fail({ turnId: "t", userId: "u", conversationId: "c", attempts: 1, leaseToken: "l" }, "memory_learning_failed");
    expect(result).toBe(true);
    expect(query.mock.calls[0]?.[0]).toContain("CASE WHEN attempts >= $5 THEN 'failed' ELSE 'queued' END");
    expect(query.mock.calls[0]?.[1]?.[5]).toBe("memory_learning_failed");
    await expect(queue.claim({ leaseToken: "l", leaseSeconds: 0 })).rejects.toThrow("lease from 1 to 900");
  });
});

describe("memory learning processor and HTTP boundary", () => {
  it("reads content only from the exact scoped completed turn and retries extractor failures", async () => {
    const job = { turnId: "turn-1", userId: "user-1", conversationId: "chat-1", attempts: 1, leaseToken: "lease-1" };
    const queue = { claim: vi.fn().mockResolvedValueOnce(job).mockResolvedValueOnce(null), complete: vi.fn(), fail: vi.fn().mockResolvedValue(true) };
    const turns = { get: vi.fn().mockResolvedValue({ id: "turn-1", userId: "user-1", conversationId: "chat-1", userMessage: "I like quiet mornings.", status: "completed" }) };
    const agent = { learnFromQueuedTurn: vi.fn().mockRejectedValue(new Error("provider details are private")) };
    const run = createMemoryLearningProcessor({ queue: queue as never, turns: turns as never, agent, createLeaseToken: () => "generated-lease" });
    expect(await run(2)).toEqual({ claimed: 1, completed: 0, retried: 1, exhausted: 0, stale: 0 });
    expect(agent.learnFromQueuedTurn).toHaveBeenCalledWith({
      userId: "user-1", conversationId: "chat-1", message: "I like quiet mornings.",
      sourceTurnReferences: [{ turnId: "turn-1", userMessage: "I like quiet mornings." }]
    });
    expect(queue.fail).toHaveBeenCalledWith(job, "memory_learning_failed");
  });

  it("requires the cron bearer, accepts only GET, and reports no private job data", async () => {
    const run = vi.fn(async () => ({ claimed: 1, completed: 1, retried: 0, exhausted: 0, stale: 0 }));
    const handler = createMemoryLearningHandler({ cronSecret: "cron-secret-value-with-at-least-32-characters", run });
    expect((await handler(new Request("https://victoria.test/cron", { method: "POST" }))).status).toBe(405);
    const unauthorized = await handler(new Request("https://victoria.test/cron"));
    expect(unauthorized.status).toBe(401);
    const response = await handler(new Request("https://victoria.test/cron", {
      headers: { authorization: "Bearer cron-secret-value-with-at-least-32-characters" }
    }));
    expect(response.status).toBe(200);
    expect(await response.json()).toEqual({ claimed: 1, completed: 1, retried: 0, exhausted: 0, stale: 0 });
    expect(run).toHaveBeenCalledWith(10);
  });
});
