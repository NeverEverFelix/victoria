import { describe, expect, it } from "vitest";
import { MemoryOrchestrator } from "../../../src/agent/memory/memory-orchestrator.js";
import { MockMemoryProvider } from "../../../src/agent/memory/mock-memory.js";
import { createMemoryControlHandler, createMemoryControlsCollectionHandler, createMemorySettingsHandler } from "../../../src/app/http/memory-controls-handler.js";

describe("memory controls handler", () => {
  it("lists only the authenticated user's current memories with provenance", async () => {
    const storage = new MockMemoryProvider();
    const memory = new MemoryOrchestrator(storage);
    await memory.rememberConversationalMemory("user-a", {
      category: "preference", key: "response_style", value: "Prefers concise replies.", evidence: "I prefer concise replies.", confidence: 0.95
    });
    await memory.rememberConversationalMemory("user-b", {
      category: "goal", key: "trip", value: "Save for a trip.", evidence: "I want to save for a trip.", confidence: 0.95
    });
    const handler = createMemoryControlsCollectionHandler({ authenticate, memory });

    const response = await handler(request("GET", "user-a"));
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ memories: [{ category: "preference", value: "Prefers concise replies.", sourceType: "user_statement" }] });
  });

  it("requires a signed-in user and does not accept caller-selected user IDs", async () => {
    const handler = createMemoryControlsCollectionHandler({ authenticate, memory: new MemoryOrchestrator(new MockMemoryProvider()) });
    expect((await handler(request("GET", null))).status).toBe(401);
    expect((await handler(request("GET", "user-a", "https://victoria.local/api/victoria/settings/memories?userId=user-b"))).status).toBe(200);
  });

  it("edits by appending a correction and requires the exact bounded payload", async () => {
    const memory = new MemoryOrchestrator(new MockMemoryProvider());
    const original = await memory.rememberConversationalMemory("user-a", {
      category: "preference", key: "response_style", value: "Prefers concise replies.", evidence: "User said concise.", confidence: 0.9
    });
    const handler = createMemoryControlHandler({ authenticate, memory });

    const response = await handler(new Request(`https://victoria.local/api/victoria/settings/memories/${original.id}`, {
      method: "PUT", headers: { authorization: "Bearer user-a", "content-type": "application/json" },
      body: JSON.stringify({ value: "Prefers detailed replies." })
    }), original.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ memory: { value: "Prefers detailed replies.", supersedesId: original.id } });
    await expect(memory.listConversationalMemories("user-a")).resolves.toMatchObject([{ value: "Prefers detailed replies." }]);
  });

  it("distinguishes a missing correction body from malformed JSON", async () => {
    const memory = new MemoryOrchestrator(new MockMemoryProvider());
    const saved = await memory.rememberConversationalMemory("user-a", {
      category: "preference", key: "response_style", value: "Prefers concise replies.", evidence: "User said concise.", confidence: 0.9
    });
    const handler = createMemoryControlHandler({ authenticate, memory });
    const response = await handler(new Request(`https://victoria.local/api/victoria/settings/memories/${saved.id}`, {
      method: "PUT", headers: { authorization: "Bearer user-a", "content-type": "application/json" }
    }), saved.id);
    expect(response.status).toBe(400);
    expect(await response.json()).toEqual({ error: "missing_body" });
  });

  it("forgets a selected memory and its superseded versions without affecting another user", async () => {
    const memory = new MemoryOrchestrator(new MockMemoryProvider());
    const original = await memory.rememberConversationalMemory("user-a", {
      category: "preference", key: "response_style", value: "Prefers concise replies.", evidence: "User said concise.", confidence: 0.9
    });
    const current = await memory.correctMemory("user-a", original.id, "Prefers detailed replies.");
    const other = await memory.rememberConversationalMemory("user-b", {
      category: "goal", key: "trip", value: "Save for a trip.", evidence: "User said trip.", confidence: 0.9
    });
    const handler = createMemoryControlHandler({ authenticate, memory });

    const response = await handler(request("DELETE", "user-a"), current.id);
    expect(response.status).toBe(200);
    expect(await response.json()).toMatchObject({ forgotten: true, notice: expect.stringContaining("30-minute context expires") });
    await expect(memory.listConversationalMemories("user-a")).resolves.toEqual([]);
    await expect(memory.listConversationalMemories("user-b")).resolves.toEqual([other]);
    expect(await (await handler(request("DELETE", "user-a"), current.id)).json()).toEqual({ error: "memory_not_found" });
  });

  it("requires financial profile memories to be removed through profile controls", async () => {
    const memory = new MemoryOrchestrator(new MockMemoryProvider());
    const profile = await memory.rememberConversationalMemory("user-a", {
      category: "financial_pattern", key: "financial_profile:merchant:cafe", value: "Typical spend is $8.",
      evidence: "Derived from posted transactions.", confidence: 0.9, sourceType: "plaid_transaction_profile", observedThrough: new Date().toISOString()
    });
    const handler = createMemoryControlHandler({ authenticate, memory });

    const editResponse = await handler(new Request(`https://victoria.local/api/victoria/settings/memories/${profile.id}`, {
      method: "PUT", headers: { authorization: "Bearer user-a", "content-type": "application/json" },
      body: JSON.stringify({ value: "User corrected amount." })
    }), profile.id);
    expect(editResponse.status).toBe(409);

    const response = await handler(request("DELETE", "user-a"), profile.id);
    expect(response.status).toBe(409);
    expect(await response.json()).toEqual({ error: "memory_managed_by_financial_profile" });
  });

  it("forgets all conversational memories while preserving Plaid profile facts and other users", async () => {
    const memory = new MemoryOrchestrator(new MockMemoryProvider());
    await memory.rememberConversationalMemory("user-a", { category: "preference", key: "x", value: "y", evidence: "said so", confidence: 1 });
    await memory.rememberConversationalMemory("user-a", { category: "financial_pattern", key: "financial_profile:merchant:cafe", value: "profile", evidence: "transactions", confidence: 1,
      sourceType: "plaid_transaction_profile", observedThrough: new Date().toISOString() });
    await memory.rememberConversationalMemory("user-b", { category: "goal", key: "trip", value: "Save", evidence: "said so", confidence: 1 });
    const handler = createMemoryControlsCollectionHandler({ authenticate, memory });
    expect((await handler(request("DELETE", "user-a"))).status).toBe(200);
    await expect(memory.listConversationalMemories("user-a")).resolves.toMatchObject([{ sourceType: "plaid_transaction_profile" }]);
    await expect(memory.listConversationalMemories("user-b")).resolves.toHaveLength(1);
  });

  it("stores authenticated pause state without deleting memories", async () => {
    const memory = new MemoryOrchestrator(new MockMemoryProvider());
    const saved = await memory.rememberConversationalMemory("user-a", { category: "preference", key: "x", value: "y", evidence: "said so", confidence: 1 });
    const handler = createMemorySettingsHandler({ authenticate, memory });
    const paused = await handler(new Request("https://victoria.local/settings/memory-settings", { method: "PUT",
      headers: { authorization: "Bearer user-a", "content-type": "application/json" }, body: JSON.stringify({ paused: true }) }));
    expect(await paused.json()).toMatchObject({ paused: true });
    expect(await memory.getMemoryForUser("user-a")).toMatchObject({ conversationalMemories: [] });
    await expect(memory.listConversationalMemories("user-a")).resolves.toEqual([saved]);
    expect((await handler(request("GET", "user-a"))).status).toBe(200);
  });
});

function authenticate(request: Request): Promise<{ readonly userId: string } | null> {
  const userId = request.headers.get("authorization")?.replace(/^Bearer /, "") ?? "";
  return Promise.resolve(userId ? { userId } : null);
}

function request(method: string, userId: string | null, url = "https://victoria.local/api/victoria/memories"): Request {
  return new Request(url, { method, headers: userId ? { authorization: `Bearer ${userId}` } : {} });
}
