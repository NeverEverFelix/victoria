import { describe, expect, it } from "vitest";
import { MemoryOrchestrator } from "../../../src/agent/memory/memory-orchestrator.js";
import { MockMemoryProvider } from "../../../src/agent/memory/mock-memory.js";
import { createMemoryManagementHandlers } from "../../../src/app/http/memory-management-handler.js";

describe("memory management handler", () => {
  it("lists only the authenticated user's current memories", async () => {
    const storage = new MockMemoryProvider();
    const own = await storage.rememberConversationalMemory("user-a", memoryFact("own_fact", "Own fact."));
    await storage.rememberConversationalMemory("user-b", memoryFact("other_fact", "Other fact."));
    const handlers = makeHandlers(storage, "user-a");

    const response = await handlers.collection(new Request("https://victoria.example/api/memories"));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ memories: [{ id: own.id, value: "Own fact." }] });
    expect(response.headers.get("Cache-Control")).toBe("no-store");
  });

  it("paginates the current memory list with an opaque cursor", async () => {
    const storage = new MockMemoryProvider();
    await storage.rememberConversationalMemory("user-a", memoryFact("one", "First fact."));
    await storage.rememberConversationalMemory("user-a", memoryFact("two", "Second fact."));
    await storage.rememberConversationalMemory("user-a", memoryFact("three", "Third fact."));
    const handlers = makeHandlers(storage, "user-a");
    const firstResponse = await handlers.collection(new Request("https://victoria.example/api/memories?limit=2"));
    const firstPage = await firstResponse.json() as { memories: Array<{ id: string }>; nextCursor: string };
    expect(firstPage.memories).toHaveLength(2);
    expect(firstPage.nextCursor).toBeTruthy();

    const secondResponse = await handlers.collection(new Request(
      `https://victoria.example/api/memories?limit=2&cursor=${encodeURIComponent(firstPage.nextCursor)}`
    ));
    const secondPage = await secondResponse.json() as { memories: Array<{ id: string }>; nextCursor: string | null };
    expect(secondPage.memories).toHaveLength(1);
    expect(secondPage.nextCursor).toBeNull();
    expect(new Set([...firstPage.memories, ...secondPage.memories].map((memory) => memory.id)).size).toBe(3);
  });

  it("appends a correction and leaves its source record intact", async () => {
    const storage = new MockMemoryProvider();
    const original = await storage.rememberConversationalMemory("user-a", memoryFact("response_style", "Prefers brief replies."));
    const handlers = makeHandlers(storage, "user-a");
    const response = await handlers.collection(jsonRequest("PATCH", {
      memoryId: original.id, value: "Prefers detailed replies."
    }));

    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({
      memory: { value: "Prefers detailed replies.", sourceType: "user_correction" }
    });
    const history = await storage.listConversationalMemories("user-a");
    expect(history).toHaveLength(2);
    expect(history[1]?.supersedesId).toBe(original.id);
    expect(history[0]?.value).toBe("Prefers brief replies.");
  });

  it("rejects unauthenticated, foreign, and malformed correction requests without mutation", async () => {
    const storage = new MockMemoryProvider();
    const foreign = await storage.rememberConversationalMemory("user-b", memoryFact("secret", "Another user's memory."));
    const unauthenticated = makeHandlers(storage, null);
    const invalidAuth = await unauthenticated.collection(new Request("https://victoria.example/api/memories"));
    expect(invalidAuth.status).toBe(401);

    const handlers = makeHandlers(storage, "user-a");
    const foreignCorrection = await handlers.collection(jsonRequest("PATCH", {
      memoryId: foreign.id, value: "Changed."
    }));
    const extraField = await handlers.collection(jsonRequest("PATCH", {
      memoryId: foreign.id, value: "Changed.", userId: "user-b"
    }));
    expect(foreignCorrection.status).toBe(404);
    expect(extraField.status).toBe(400);
    await expect(storage.listConversationalMemories("user-b")).resolves.toHaveLength(1);
  });

  it("forgets current recall while clearly retaining history", async () => {
    const storage = new MockMemoryProvider();
    const original = await storage.rememberConversationalMemory("user-a", memoryFact("habit", "Makes coffee at home."));
    const handlers = makeHandlers(storage, "user-a");

    const response = await handlers.forget(
      new Request("https://victoria.example/api/memories/unused/forget", { method: "POST" }),
      { memoryId: original.id }
    );

    expect(response.status).toBe(200);
    const payload = await response.json() as { status: string; memoryId: string; detail: string };
    expect(payload).toMatchObject({ status: "forgotten", memoryId: original.id });
    expect(payload.detail).toContain("historical record is retained");
    await expect(new MemoryOrchestrator(storage).listConversationalMemories("user-a")).resolves.toEqual([]);
    await expect(storage.listConversationalMemories("user-a")).resolves.toHaveLength(2);
  });
});

function makeHandlers(storage: MockMemoryProvider, authenticatedUser: string | null) {
  const memory = new MemoryOrchestrator(storage);
  return createMemoryManagementHandlers({
    authenticate: async () => authenticatedUser ? { userId: authenticatedUser } : null,
    memory
  });
}

function memoryFact(key: string, value: string) {
  return { category: "preference" as const, key, value, evidence: "User stated this.", confidence: 0.95 };
}

function jsonRequest(method: string, body: unknown): Request {
  return new Request("https://victoria.example/api/memories", {
    method,
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body)
  });
}
