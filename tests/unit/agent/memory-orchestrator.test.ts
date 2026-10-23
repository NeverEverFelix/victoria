import { describe, expect, it, vi } from "vitest";
import { MemoryOrchestrator } from "../../../src/agent/memory/memory-orchestrator.js";
import { MockMemoryProvider } from "../../../src/agent/memory/mock-memory.js";
import type { ConversationalMemory } from "../../../src/agent/memory/types.js";

const profileMemory = (overrides: Partial<Omit<ConversationalMemory, "id" | "createdAt">> = {}): Omit<ConversationalMemory, "id" | "createdAt"> => ({
  category: "financial_pattern" as const,
  key: "financial_profile:merchant:cafe",
  value: "Typical spend at Cafe is $8.00.",
  evidence: "Derived from posted transaction history.",
  confidence: 0.8,
  sourceType: "plaid_transaction_profile" as const,
  observedThrough: "2026-10-01",
  ...overrides
});

describe("MemoryOrchestrator", () => {
  it("preserves a paginated current-memory page returned by storage", async () => {
    const storage = new MockMemoryProvider();
    const row = {
      id: "older-current-row", category: "preference" as const, key: "reply_style", value: "Concise.",
      evidence: "Direct statement.", confidence: 1, createdAt: "2025-01-01T00:00:00.000Z"
    };
    const listCurrent = vi.spyOn(storage, "listCurrentConversationalMemories").mockResolvedValue([row]);
    const orchestrator = new MemoryOrchestrator(storage, { now: () => new Date("2026-10-19T12:00:00.000Z") });
    const page = { limit: 1, before: { createdAt: "2025-01-02T00:00:00.000Z", id: "cursor" } };

    await expect(orchestrator.listConversationalMemories("user-a", page)).resolves.toEqual([row]);
    expect(listCurrent).toHaveBeenCalledWith("user-a", false, page);
  });

  it("versions repeated learned facts and retrieves only the current fact", async () => {
    const orchestrator = new MemoryOrchestrator(new MockMemoryProvider(), { now: () => new Date() });
    const first = await orchestrator.rememberConversationalMemory("user-a", {
      category: "preference", key: "response_style", value: "Prefers concise answers.", evidence: "User said so.",
      confidence: 0.95, sourceType: "user_statement"
    });
    const updated = await orchestrator.rememberConversationalMemory("user-a", {
      category: "preference", key: "response_style", value: "Prefers detailed answers.", evidence: "User corrected this.",
      confidence: 1, sourceType: "user_correction"
    });

    expect(updated.supersedesId).toBe(first.id);
    await expect(orchestrator.listConversationalMemories("user-a")).resolves.toEqual([updated]);
    await expect(orchestrator.listConversationalMemories("user-b")).resolves.toEqual([]);
  });

  it("forgets one user fact from current retrieval while preserving linked history", async () => {
    const storage = new MockMemoryProvider();
    const first = await storage.rememberConversationalMemory("user-a", {
      category: "preference", key: "response_style", value: "Prefers concise answers.",
      evidence: "User said so.", confidence: 0.95, sourceType: "user_statement"
    });
    const orchestrator = new MemoryOrchestrator(storage);

    await orchestrator.forgetMemory("user-a", first.id);

    await expect(orchestrator.listConversationalMemories("user-a")).resolves.toEqual([]);
    const history = await storage.listConversationalMemories("user-a");
    expect(history).toHaveLength(2);
    expect(history[1]).toMatchObject({ supersedesId: first.id, sourceMetadata: { memoryStatus: "forgotten" } });
    await expect(orchestrator.listConversationalMemories("user-b")).resolves.toEqual([]);
    await expect(orchestrator.forgetMemory("user-a", first.id)).rejects.toThrow("The memory was not found for this user.");
  });

  it("lets a new explicit fact supersede an earlier forget marker", async () => {
    const storage = new MockMemoryProvider();
    const orchestrator = new MemoryOrchestrator(storage);
    const first = await orchestrator.rememberConversationalMemory("user-a", {
      category: "preference", key: "response_style", value: "Prefers concise answers.",
      evidence: "User said so.", confidence: 0.95, sourceType: "user_statement"
    });
    await orchestrator.forgetMemory("user-a", first.id);
    const restored = await orchestrator.rememberConversationalMemory("user-a", {
      category: "preference", key: "response_style", value: "Prefers concise answers.",
      evidence: "User stated this preference again.", confidence: 0.95, sourceType: "user_statement"
    });

    expect(restored.supersedesId).not.toBe(first.id);
    await expect(orchestrator.listConversationalMemories("user-a")).resolves.toEqual([restored]);
  });

  it("excludes stale transaction profile facts but keeps current user memories", async () => {
    const storage = new MockMemoryProvider();
    await storage.rememberConversationalMemory("user-a", profileMemory({ observedThrough: "2026-05-01" }));
    await storage.rememberConversationalMemory("user-a", {
      category: "goal", key: "move", value: "Wants to save for a move.", evidence: "User said so.", confidence: 0.95
    });
    const orchestrator = new MemoryOrchestrator(storage, { now: () => new Date() });

    const result = await orchestrator.getMemoryForUser("user-a", "move");
    expect(result.conversationalMemories?.map((memory) => memory.key)).toEqual(["move"]);
  });

  it("excludes ordinary memories older than 24 months even before physical cleanup", async () => {
    const storage = new MockMemoryProvider();
    const stale: ConversationalMemory = {
      id: "stale-ordinary", category: "preference", key: "reply_style", value: "Prefers concise replies.",
      evidence: "User stated it.", confidence: 1, createdAt: "2024-10-01T00:00:00.000Z", sourceType: "user_statement"
    };
    vi.spyOn(storage, "searchConversationalMemories").mockResolvedValue([stale]);
    vi.spyOn(storage, "filterCurrentConversationalMemoryIds").mockResolvedValue(new Set([stale.id]));
    const orchestrator = new MemoryOrchestrator(storage, { now: () => new Date("2026-10-21T00:00:00.000Z") });

    const result = await orchestrator.getMemoryForUser("user-a", "reply style");

    expect(result.conversationalMemories).toEqual([]);
  });

  it("makes missing, stale, and future profile observations unavailable in mock retrieval", async () => {
    const storage = new MockMemoryProvider();
    const { observedThrough: _observedThrough, ...missingObservation } = profileMemory({ key: "profile:missing" });
    await storage.rememberConversationalMemory("user-a", missingObservation);
    await storage.rememberConversationalMemory("user-a", profileMemory({ key: "profile:stale", observedThrough: "2026-01-01" }));
    await storage.rememberConversationalMemory("user-a", profileMemory({ key: "profile:future", observedThrough: "2027-01-01" }));
    await storage.rememberConversationalMemory("user-a", profileMemory({ key: "profile:current", observedThrough: new Date().toISOString() }));

    const result = await storage.getMemoryForUser("user-a");
    expect(result.conversationalMemories?.map((memory) => memory.key)).toEqual(["profile:current"]);
  });

  it("sends profile refreshes through the configured profile writer", async () => {
    const writer = { rememberFinancialProfile: vi.fn(async () => []) };
    const orchestrator = new MemoryOrchestrator(new MockMemoryProvider(), { financialProfiles: writer });
    const profile = {
      userId: "user-a", source: "plaid_transactions" as const, generatedAt: "2026-10-13T12:00:00Z", lookbackDays: 90,
      facts: [], metadataAvailability: { checkedTransactionCount: 0, hasEnrichableMetadata: false,
        fields: { detailedCategory: { availableCount: 0, coverage: 0 }, merchantEntityId: { availableCount: 0, coverage: 0 },
          paymentChannel: { availableCount: 0, coverage: 0 } } }
    };

    await expect(orchestrator.rememberFinancialProfile(profile)).resolves.toEqual([]);
    expect(writer.rememberFinancialProfile).toHaveBeenCalledWith(profile);
  });

});
