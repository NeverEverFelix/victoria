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
