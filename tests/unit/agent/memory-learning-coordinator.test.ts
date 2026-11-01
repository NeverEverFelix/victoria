import { describe, expect, it, vi } from "vitest";
import { MockMemoryProvider } from "../../../src/agent/memory/mock-memory.js";
import { MemoryLearningCoordinator } from "../../../src/agent/memory/memory-learning-coordinator.js";

const request = {
  userId: "memory-coordinator-user",
  conversationId: "memory-coordinator-chat",
  message: "I prefer hiking on weekends.",
  sourceTurnReferences: [{ turnId: "memory-coordinator-turn", userMessage: "I prefer hiking on weekends." }]
};

const candidate = {
  category: "preference", key: "activity:hiking", value: "Prefers hiking on weekends.",
  evidence: "I prefer hiking on weekends.", confidence: 0.95, subject: "user", assertion: "affirmed",
  stability: "stable", sensitivity: "ordinary"
} as const;

describe("MemoryLearningCoordinator", () => {
  it("uses inline learning only when no durable queue is configured", async () => {
    const memory = new MockMemoryProvider();
    const extractor = { extract: vi.fn(async () => [candidate]) };
    const coordinator = new MemoryLearningCoordinator({ memory, extractor });

    await expect(coordinator.learnEligibleTurn(request)).resolves.toBe(1);
    await expect(memory.listConversationalMemories(request.userId)).resolves.toHaveLength(1);
    expect(extractor.extract).toHaveBeenCalledExactlyOnceWith({ userMessage: request.message });
  });

  it("keeps extraction off the foreground path when durable queueing fails", async () => {
    const memory = new MockMemoryProvider();
    const extractor = { extract: vi.fn(async () => [candidate]) };
    const onQueueFailure = vi.fn();
    const coordinator = new MemoryLearningCoordinator({
      memory, extractor,
      enqueuer: { async enqueue() { throw new Error("queue outage"); } },
      onQueueFailure
    });

    await expect(coordinator.learnEligibleTurn(request)).resolves.toBe(0);
    await coordinator.learnReadOnlyTopicTurn(request);
    expect(extractor.extract).not.toHaveBeenCalled();
    expect(onQueueFailure.mock.calls).toEqual([["unavailable"], ["unavailable"]]);
    await expect(memory.listConversationalMemories(request.userId)).resolves.toEqual([]);
  });

  it("rejects queueing without a source turn identity and reports only a categorical failure", async () => {
    const extractor = { extract: vi.fn(async () => [candidate]) };
    const enqueue = vi.fn(async () => true);
    const onQueueFailure = vi.fn();
    const coordinator = new MemoryLearningCoordinator({
      memory: new MockMemoryProvider(), extractor, enqueuer: { enqueue }, onQueueFailure
    });

    await coordinator.learnEligibleTurn({ ...request, sourceTurnReferences: [] });

    expect(enqueue).not.toHaveBeenCalled();
    expect(extractor.extract).not.toHaveBeenCalled();
    expect(onQueueFailure).toHaveBeenCalledExactlyOnceWith("turn_reference_missing");
    expect(JSON.stringify(onQueueFailure.mock.calls)).not.toContain(request.message);
  });

  it("surfaces worker extraction failures for durable retry handling", async () => {
    const extractor = { extract: vi.fn(async () => { throw new Error("provider unavailable"); }) };
    const coordinator = new MemoryLearningCoordinator({ memory: new MockMemoryProvider(), extractor });

    await expect(coordinator.learnQueuedTurn(request)).rejects.toThrow("provider unavailable");
  });
});
