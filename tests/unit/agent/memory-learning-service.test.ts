import { describe, expect, it, vi } from "vitest";
import { MockMemoryProvider } from "../../../src/agent/memory/mock-memory.js";
import { learnConversationalMemories } from "../../../src/agent/memory/memory-learning-service.js";

const request = {
  userId: "memory-learning-user",
  conversationId: "memory-learning-chat",
  message: "I prefer hiking on weekends.",
  sourceTurnReferences: [{ turnId: "turn_1", userMessage: "I prefer hiking on weekends." }]
};

const candidate = {
  category: "preference",
  key: "activity:hiking",
  value: "Prefers hiking on weekends.",
  evidence: "I prefer hiking on weekends.",
  confidence: 0.95,
  subject: "user",
  assertion: "affirmed",
  stability: "stable",
  sensitivity: "ordinary"
} as const;

describe("learnConversationalMemories", () => {
  it("persists validated candidates with turn provenance and append-only supersession", async () => {
    const storage = new MockMemoryProvider();
    const prior = await storage.rememberConversationalMemory(request.userId, {
      category: "preference", key: candidate.key, value: "Prefers walking on weekends.",
      evidence: "I prefer walking on weekends.", confidence: 0.9, sourceType: "user_statement"
    });
    const extractor = { extract: vi.fn(async () => [candidate]) };

    const count = await learnConversationalMemories({ request, storage, extractor });
    const history = await storage.listConversationalMemories(request.userId);

    expect(count).toBe(1);
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({
      key: candidate.key, supersedesId: prior.id,
      sourceMetadata: { sourceTurnReferences: [{ turnId: "turn_1" }] }
    });
  });

  it("does not append a duplicate current memory on an extraction retry", async () => {
    const storage = new MockMemoryProvider();
    const extractor = { extract: vi.fn(async () => [candidate]) };

    await learnConversationalMemories({ request, storage, extractor });
    await learnConversationalMemories({ request, storage, extractor });

    expect(await storage.listConversationalMemories(request.userId)).toHaveLength(1);
  });

  it("keeps provider failures content-free and non-blocking", async () => {
    const onFailure = vi.fn();
    const count = await learnConversationalMemories({
      request,
      storage: new MockMemoryProvider(),
      extractor: { async extract() { throw new Error("private message content"); } },
      onFailure
    });

    expect(count).toBe(0);
    expect(onFailure).toHaveBeenCalledExactlyOnceWith("provider_or_validation_error");
    expect(JSON.stringify(onFailure.mock.calls)).not.toContain("private message content");
  });
});
