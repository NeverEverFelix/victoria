import { describe, expect, it } from "vitest";
import { ConversationTranscriptService } from "../../../src/agent/conversation-transcript-service.js";
import { MockMemoryProvider } from "../../../src/agent/memory/mock-memory.js";
import type { MemoryProvider } from "../../../src/agent/memory/types.js";

describe("ConversationTranscriptService", () => {
  it("does not append a duplicated source turn ID", async () => {
    const memory = new MockMemoryProvider();
    const service = new ConversationTranscriptService(memory);
    await memory.setConversationMessages("user", "chat", [{
      schemaVersion: 1, id: "source-turn-1", conversationId: "chat", role: "user", content: "hello", status: "completed"
    }]);
    const loaded = await service.load("user", "chat");

    const messages = service.appendUserTurn({
      conversationId: "chat", message: "hello", sourceTurnReferences: [{ turnId: "source-turn-1", userMessage: "hello" }], loaded
    });

    expect(messages).toHaveLength(1);
    expect(messages[0]?.id).toBe("source-turn-1");
  });

  it("preserves typed messages when a sourced turn is new", async () => {
    const memory = new MockMemoryProvider();
    const service = new ConversationTranscriptService(memory);
    await memory.setConversationMessages("user", "chat", [{
      schemaVersion: 1, id: "prior", conversationId: "chat", role: "assistant", content: "How can I help?", status: "completed"
    }]);
    const loaded = await service.load("user", "chat");

    const messages = service.appendUserTurn({
      conversationId: "chat", message: "I have a question", sourceTurnReferences: [{ turnId: "turn-2", userMessage: "I have a question" }], loaded
    });
    await service.persist("user", "chat", messages);
    const stored = await memory.getConversationMessages("user", "chat");

    expect(stored.map(({ role, content, id }) => ({ role, content, id }))).toEqual([
      { role: "assistant", content: "How can I help?", id: "prior" },
      { role: "user", content: "I have a question", id: "turn-2" }
    ]);
  });

  it("reads and persists legacy context when typed transcript methods are unavailable", async () => {
    const memory = new MockMemoryProvider();
    await memory.setConversationContext("user", "chat", ["Victoria: Welcome", "User: Earlier detail"]);
    const legacyOnlyMemory = new Proxy(memory as MemoryProvider, {
      get(target, property, receiver) {
        if (property === "getConversationMessages" || property === "setConversationMessages") return undefined;
        const value = Reflect.get(target, property, receiver);
        return typeof value === "function" ? value.bind(target) : value;
      }
    });
    const service = new ConversationTranscriptService(legacyOnlyMemory);
    const loaded = await service.load("user", "chat");
    const messages = service.appendUserTurn({ conversationId: "chat", message: "Next", loaded });
    await service.persist("user", "chat", service.appendAssistantTurn({ conversationId: "chat", messages, response: "Answer" }));

    expect(loaded.typedMessages).toBeUndefined();
    expect(await memory.getConversationContext("user", "chat")).toEqual([
      "Victoria: Welcome", "Earlier detail", "Next", "Victoria: Answer"
    ]);
  });
});
