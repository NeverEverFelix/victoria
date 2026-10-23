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

  it("exposes bounded spend, mapping, and transaction provenance for review without raw metadata", async () => {
    const storage = new MockMemoryProvider();
    await storage.rememberConversationalMemory("user-a", {
      category: "financial_pattern", key: "interest_spend:hiking",
      value: "Usually spends $45.00 per month on hiking.", evidence: "I spend about $45 a month on hiking.", confidence: 0.95,
      sourceType: "user_statement", sourceMetadata: { activity: "hiking", cadence: "month", currency: "USD", privatePayload: "must not leak" }
    });
    await storage.rememberConversationalMemory("user-a", {
      category: "financial_pattern", key: "activity_mapping:hiking",
      value: "Uses linked transaction category “recreation” for hiking spending.", evidence: "For hiking, my transaction category is recreation.", confidence: 1,
      sourceType: "user_statement",
      sourceMetadata: { activity: "hiking", dimension: "category", target: "recreation", profileKey: "internal-key", rawPayload: "must not leak" }
    });
    await storage.rememberConversationalMemory("user-a", {
      category: "financial_pattern", key: "financial_profile:category:recreation",
      value: "Recorded $128.00 across 4 posted purchases in Recreation.", evidence: "Derived profile summary.", confidence: 0.8,
      sourceType: "plaid_transaction_profile", observedFrom: "2026-09-01", observedThrough: "2026-10-21",
      sourceRecordCount: 4, sourceMetadata: { dimension: "category", totalCents: 12800, currency: "USD", lookbackDays: 90, rawPayload: "must not leak" }
    });
    const handlers = makeHandlers(storage, "user-a");

    const response = await handlers.collection(new Request("https://victoria.example/api/memories"));
    const payload = await response.json() as { memories: Array<Record<string, unknown>> };
    expect(payload.memories).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "interest_spend:hiking", details: {
        spendingBasis: "user_reported", activity: "hiking", cadence: "month", currency: "USD"
      } }),
      expect.objectContaining({ key: "activity_mapping:hiking", details: {
        mappingBasis: "user_confirmed", activity: "hiking", mappedLabel: "recreation", mappingType: "category"
      } }),
      expect.objectContaining({ key: "financial_profile:category:recreation", details: {
        spendingBasis: "linked_transactions", dimension: "category", totalCents: 12800, lookbackDays: 90, currency: "USD"
      }, sourceRecordCount: 4, observedFrom: "2026-09-01", observedThrough: "2026-10-21" })
    ]));
    expect(JSON.stringify(payload)).not.toContain("rawPayload");
    expect(JSON.stringify(payload)).not.toContain("privatePayload");
    expect(JSON.stringify(payload)).not.toContain("internal-key");
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

  it("corrects an activity mapping from a clear statement and removes the old mapping from current review", async () => {
    const storage = new MockMemoryProvider();
    const original = await storage.rememberConversationalMemory("user-a", {
      category: "financial_pattern", key: "activity_mapping:hiking",
      value: "Uses linked transaction category “recreation” for hiking spending.",
      evidence: "For hiking, my transaction category is recreation.", confidence: 1,
      sourceType: "user_statement", sourceMetadata: {
        activity: "hiking", dimension: "category", target: "recreation", profileKey: "financial_profile:category:recreation"
      }
    });
    const handlers = makeHandlers(storage, "user-a");

    const response = await handlers.collection(jsonRequest("PATCH", {
      memoryId: original.id, value: "For hiking, my transaction category is outdoors."
    }));
    expect(response.status).toBe(200);
    await expect(response.json()).resolves.toMatchObject({ memory: {
      key: "activity_mapping:hiking", sourceType: "user_correction",
      details: { mappingBasis: "user_confirmed", activity: "hiking", mappedLabel: "outdoors", mappingType: "category" }
    } });
    const current = await new MemoryOrchestrator(storage).listConversationalMemories("user-a");
    expect(current).toHaveLength(1);
    expect(current[0]).toMatchObject({ key: "activity_mapping:hiking", supersedesId: original.id,
      sourceMetadata: { target: "outdoors", correctedFrom: original.id } });
    expect(await storage.listConversationalMemories("user-a")).toHaveLength(2);
  });

  it("lets a user mark a remembered interest inactive through memory controls", async () => {
    const storage = new MockMemoryProvider();
    const original = await storage.rememberConversationalMemory("user-a", {
      category: "other", key: "interest:hiking", value: "Enjoys hiking.",
      evidence: "I love hiking.", confidence: 0.95, sourceType: "user_statement"
    });
    const handlers = makeHandlers(storage, "user-a");

    const response = await handlers.collection(jsonRequest("PATCH", {
      memoryId: original.id, value: "I don't enjoy hiking anymore."
    }));

    await expect(response.json()).resolves.toMatchObject({ memory: {
      key: "interest:hiking", value: "No longer enjoys hiking.", sourceType: "user_correction"
    } });
    expect(await new MemoryOrchestrator(storage).listConversationalMemories("user-a")).toHaveLength(1);
    expect(await storage.listConversationalMemories("user-a")).toHaveLength(2);
  });

  it("requires a clear structured correction and does not allow editing transaction aggregates", async () => {
    const storage = new MockMemoryProvider();
    const mapping = await storage.rememberConversationalMemory("user-a", {
      category: "financial_pattern", key: "activity_mapping:hiking", value: "Uses recreation for hiking.",
      evidence: "Direct mapping.", confidence: 1, sourceType: "user_statement"
    });
    const profile = await storage.rememberConversationalMemory("user-a", {
      category: "financial_pattern", key: "financial_profile:category:recreation", value: "Recorded $128.00.",
      evidence: "Derived summary.", confidence: 0.8, sourceType: "plaid_transaction_profile", observedThrough: new Date().toISOString()
    });
    const handlers = makeHandlers(storage, "user-a");

    expect((await handlers.collection(jsonRequest("PATCH", { memoryId: mapping.id, value: "Recreation." }))).status).toBe(400);
    expect((await handlers.collection(jsonRequest("PATCH", { memoryId: profile.id, value: "The category is wrong." }))).status).toBe(400);
    await expect(storage.listConversationalMemories("user-a")).resolves.toHaveLength(2);
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
    expect(payload.detail).toContain("physical deletion after 30 days");
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
