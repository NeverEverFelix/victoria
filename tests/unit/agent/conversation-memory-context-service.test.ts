import { describe, expect, it, vi } from "vitest";
import { MockMemoryProvider } from "../../../src/agent/index.js";
import { ConversationMemoryContextService } from "../../../src/agent/conversation-memory-context-service.js";

describe("ConversationMemoryContextService", () => {
  it("returns empty optional context when memory retrieval is unavailable", async () => {
    const memory = new MockMemoryProvider();
    vi.spyOn(memory, "getMemoryForUser").mockRejectedValue(new Error("memory unavailable"));
    const service = new ConversationMemoryContextService(memory);

    await expect(service.retrieve("context_user", "What should I consider?"))
      .resolves.toEqual({ habits: [], goals: [], recentDecisions: [], conversationalMemories: [] });
  });

  it("omits narrative episodes when lifecycle verification is unavailable", async () => {
    const memory = new MockMemoryProvider();
    vi.spyOn(memory, "getMemoryForUser").mockResolvedValue({
      habits: [], goals: [], recentDecisions: [], conversationalMemories: [{
        id: "episode_1", category: "other", key: "episode:weekends",
        value: "The user enjoys a calm weekend routine.", evidence: "I like calm weekends.",
        confidence: 0.9, createdAt: new Date().toISOString(), sourceType: "system_inference",
        sourceMetadata: { memoryKind: "episodic_summary" }
      }]
    });
    vi.spyOn(memory, "listCurrentConversationalMemories").mockRejectedValue(new Error("lifecycle store unavailable"));
    const service = new ConversationMemoryContextService(memory);

    await expect(service.retrieve("context_user", "What do you remember about weekends?"))
      .resolves.toMatchObject({ conversationalMemories: [] });
  });
});
