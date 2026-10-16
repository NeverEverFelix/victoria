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
  it("versions repeated learned facts and retrieves only the current fact", async () => {
    const orchestrator = new MemoryOrchestrator(new MockMemoryProvider(), { now: () => new Date("2026-10-13T12:00:00Z") });
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

  it("isolates memory reads and deletion by user", async () => {
    const storage = new MockMemoryProvider();
    const orchestrator = new MemoryOrchestrator(storage);
    const a = await orchestrator.rememberConversationalMemory("user-a", {
      category: "preference", key: "tone", value: "Concise", evidence: "User said so.", confidence: 1
    });
    const b = await orchestrator.rememberConversationalMemory("user-b", {
      category: "preference", key: "tone", value: "Detailed", evidence: "User said so.", confidence: 1
    });

    await expect(orchestrator.searchConversationalMemories("user-a", "tone")).resolves.toEqual([a]);
    await expect(orchestrator.searchConversationalMemories("user-b", "tone")).resolves.toEqual([b]);
    await expect(orchestrator.forgetConversationalMemory("user-b", a.id)).resolves.toBe(false);
    await expect(orchestrator.listConversationalMemories("user-a")).resolves.toEqual([a]);
    await expect(orchestrator.listConversationalMemories("user-b")).resolves.toEqual([b]);
  });

  it("keeps paused memories reviewable, excludes them from retrieval, and deletes them immediately", async () => {
    const storage = new MockMemoryProvider();
    const orchestrator = new MemoryOrchestrator(storage);
    const saved = await orchestrator.rememberConversationalMemory("user-a", {
      category: "preference", key: "coffee", value: "Prefers decaf", evidence: "User said so.", confidence: 1
    });
    await orchestrator.setMemoryPaused("user-a", true);

    await expect(orchestrator.listConversationalMemories("user-a")).resolves.toEqual([saved]);
    await expect(orchestrator.searchConversationalMemories("user-a", "coffee")).resolves.toEqual([]);
    await expect(orchestrator.getMemoryForUser("user-a", "coffee")).resolves.toMatchObject({ conversationalMemories: [] });
    await expect(orchestrator.forgetConversationalMemory("user-a", saved.id)).resolves.toBe(true);
    await expect(orchestrator.searchConversationalMemories("user-a", "coffee")).resolves.toEqual([]);
    await expect(orchestrator.listConversationalMemories("user-a")).resolves.toEqual([]);
    await orchestrator.setMemoryPaused("user-a", false);
    await expect(orchestrator.searchConversationalMemories("user-a", "coffee")).resolves.toEqual([]);
  });

  it("keeps separately managed Plaid profile facts available while conversational memory is paused", async () => {
    const storage = new MockMemoryProvider();
    const orchestrator = new MemoryOrchestrator(storage, { maxMemoriesPerTurn: 2 });
    const profile = await storage.rememberConversationalMemory("user-a", profileMemory({
      value: "Typical spend at Cafe is $8.00.", observedThrough: new Date().toISOString().slice(0, 10)
    }));
    await storage.rememberConversationalMemory("user-a", profileMemory({
      key: "financial_profile:merchant:bakery", value: "Typical spend at Bakery is $6.00.",
      observedThrough: "2026-01-01"
    }));
    await orchestrator.setMemoryPaused("user-a", true);

    await expect(orchestrator.searchConversationalMemories("user-a", "cafe")).resolves.toEqual([profile]);
    await expect(orchestrator.getMemoryForUser("user-a", "cafe")).resolves.toMatchObject({ conversationalMemories: [profile] });
    await Promise.all(["one", "two", "three"].map((merchant) => storage.rememberConversationalMemory("user-a", profileMemory({
      key: `financial_profile:merchant:${merchant}`, observedThrough: new Date().toISOString().slice(0, 10)
    }))));
    const bounded = await orchestrator.getMemoryForUser("user-a");
    expect(bounded.conversationalMemories).toHaveLength(2);
    expect(bounded.conversationalMemories?.every((memory) => memory.sourceType === "plaid_transaction_profile" &&
      memory.observedThrough === new Date().toISOString().slice(0, 10))).toBe(true);
    expect(bounded.conversationalMemories?.some((memory) => memory.key.includes("bakery"))).toBe(false);
  });

  it("excludes stale transaction profile facts but keeps current user memories", async () => {
    const storage = new MockMemoryProvider();
    await storage.rememberConversationalMemory("user-a", profileMemory({ observedThrough: "2026-05-01" }));
    await storage.rememberConversationalMemory("user-a", {
      category: "goal", key: "move", value: "Wants to save for a move.", evidence: "User said so.", confidence: 0.95
    });
    const orchestrator = new MemoryOrchestrator(storage, { now: () => new Date("2026-10-13T12:00:00Z") });

    const result = await orchestrator.getMemoryForUser("user-a", "move");
    expect(result.conversationalMemories?.map((memory) => memory.key)).toEqual(["move"]);
  });

  it("makes missing, stale, and future profile observations unavailable in mock retrieval", async () => {
    const storage = new MockMemoryProvider();
    const { observedThrough: _observedThrough, ...missingObservation } = profileMemory({ key: "profile:missing" });
    void _observedThrough;
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
