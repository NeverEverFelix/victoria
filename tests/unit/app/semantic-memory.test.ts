import { describe, expect, it, vi } from "vitest";
import { PostgresMemoryRepository } from "../../../src/agent/memory/postgres-memory-repository.js";
import type { PostgresQueryResult, PostgresQueryable } from "../../../src/app/turns/postgres-turn-repository.js";
import type { ConversationalMemory } from "../../../src/agent/memory/types.js";

const vector = Array.from({ length: 1536 }, (_, index) => index === 0 ? 1 : 0);

class ScriptedDatabase implements PostgresQueryable {
  readonly calls: { sql: string; values: readonly unknown[] }[] = [];
  constructor(private readonly respond: (sql: string, values: readonly unknown[]) => unknown[] = () => []) {}
  async query<Row>(sql: string, values: readonly unknown[] = []): Promise<PostgresQueryResult<Row>> {
    this.calls.push({ sql, values });
    return { rows: this.respond(sql, values) as Row[] };
  }
}

const embeddingProvider = {
  modelId: "test-embedding-model",
  embed: vi.fn(async () => vector)
};

function memory(overrides: Partial<Omit<ConversationalMemory, "id" | "createdAt">> = {}) {
  return {
    category: "habit" as const,
    key: "coffee",
    value: "Usually makes coffee at home.",
    evidence: "I usually make coffee at home.",
    confidence: 0.9,
    ...overrides
  };
}

describe("PostgresMemoryRepository semantic memory", () => {
  it("persists a memory and its embedding as separate user-scoped append-only records", async () => {
    const database = new ScriptedDatabase((sql) => sql.includes("INSERT INTO victoria_conversational_memories")
      ? [{ id: "memory-1", category: "habit", key: "coffee", value: "Usually makes coffee at home.",
        evidence: "I usually make coffee at home.", confidence: 0.9, createdAt: "2026-10-13T12:00:00.000Z", sourceType: "user_statement" }]
      : []);
    const repository = new PostgresMemoryRepository(database, 30_000, embeddingProvider);

    const saved = await repository.rememberConversationalMemory("user-a", memory());

    expect(saved.id).toBe("memory-1");
    expect(database.calls).toHaveLength(2);
    expect(database.calls[0]?.values[1]).toBe("user-a");
    expect(database.calls[1]?.sql).toContain("victoria_memory_embeddings");
    expect(database.calls[1]?.values).toContain("user-a");
    expect(database.calls[1]?.values).toContain("memory-1");
    expect(database.calls[1]?.values).toContain("test-embedding-model");
    expect(database.calls[1]?.values).toContain(`[${vector.join(",")}]`);
  });

  it("retrieves relevant memories through vector similarity with user and model filters", async () => {
    const database = new ScriptedDatabase((sql) => sql.includes("victoria_search_conversational_memories")
      ? [{ id: "memory-2", category: "financial_pattern", key: "merchant:coffee", value: "Typical coffee spend is $6.",
        evidence: "3 posted purchases", confidence: 0.8, createdAt: "2026-10-13T12:00:00.000Z",
        sourceType: "plaid_transaction_profile", similarity: 0.91 }]
      : []);
    const repository = new PostgresMemoryRepository(database, 30_000, embeddingProvider);

    const relevant = await repository.searchConversationalMemories("user-a", "coffee spending", 8);

    expect(relevant).toMatchObject([{ id: "memory-2", category: "financial_pattern", value: "Typical coffee spend is $6." }]);
    expect(database.calls[0]?.sql).toContain("victoria_search_conversational_memories");
    expect(database.calls[0]?.values?.[0]).toBe("user-a");
    expect(database.calls[0]?.values?.[2]).toBe("test-embedding-model");
  });

  it("keeps the non-vector fallback user-scoped and excludes superseded or stale profile facts", async () => {
    const database = new ScriptedDatabase((sql) => sql.includes("FROM victoria_conversational_memories m")
      ? [{ id: "current", category: "habit", key: "coffee", value: "Current fact", evidence: "direct",
        confidence: 1, createdAt: "2026-10-13T12:00:00.000Z" }]
      : []);
    const repository = new PostgresMemoryRepository(database);

    const relevant = await repository.searchConversationalMemories("user-a", "coffee spend");

    expect(relevant).toMatchObject([{ id: "current" }]);
    expect(database.calls[0]?.values[0]).toBe("user-a");
    expect(database.calls[0]?.sql).toContain("newer.supersedes_id = m.id");
    expect(database.calls[0]?.sql).toContain("m.observed_through >= current_date - 90");
  });

  it("persists transaction-profile facts with source window and sample metadata", async () => {
    const database = new ScriptedDatabase((sql) => sql.includes("INSERT INTO victoria_conversational_memories")
      ? [{ id: "profile-memory-1", category: "financial_pattern", key: "financial_profile:merchant:coffee shop",
        value: "Typical spend at Coffee Shop is $6.00.", evidence: "Derived from 3 posted USD purchases.", confidence: 0.8,
        createdAt: "2026-10-13T12:00:00.000Z", sourceType: "plaid_transaction_profile",
        observedFrom: "2026-09-01", observedThrough: "2026-10-01", sourceRecordCount: 3 }]
      : []);
    const repository = new PostgresMemoryRepository(database);

    const saved = await repository.rememberFinancialProfile({
      userId: "user-a", source: "plaid_transactions", generatedAt: "2026-10-13T12:00:00.000Z", lookbackDays: 90,
      facts: [{ dimension: "merchant", key: "coffee shop", label: "Coffee Shop", transactionCount: 3,
        totalCents: 1800, typicalAmountCents: 600, currency: "USD", source: "plaid_transactions",
        observedFrom: "2026-09-01", observedThrough: "2026-10-01", confidence: 0.8 }],
      metadataAvailability: { checkedTransactionCount: 0, hasEnrichableMetadata: false,
        fields: { detailedCategory: { availableCount: 0, coverage: 0 },
          merchantEntityId: { availableCount: 0, coverage: 0 }, paymentChannel: { availableCount: 0, coverage: 0 } } }
    });

    expect(saved).toMatchObject([{ category: "financial_pattern", sourceType: "plaid_transaction_profile",
      observedFrom: "2026-09-01", observedThrough: "2026-10-01", sourceRecordCount: 3 }]);
    const insert = database.calls.find((call) => call.sql.includes("INSERT INTO victoria_conversational_memories"));
    expect(insert?.values).toContain("user-a");
    expect(insert?.values).toContain("2026-09-01");
    expect(insert?.values).toContain(3);
  });

  it("supersedes profile facts that disappear from a completed refresh without embedding tombstones", async () => {
    const database = new ScriptedDatabase((sql) => {
      if (sql.includes("SELECT m.id, m.memory_key AS key")) return [{ id: "old-profile", key: "financial_profile:merchant:cafe",
        value: "Typical spend at Cafe is $8.00.", confidence: 0.8, sourceMetadata: { profileStatus: "active" } }];
      if (sql.includes("INSERT INTO victoria_conversational_memories")) return [{ id: "inactive-profile",
        category: "financial_pattern", key: "financial_profile:merchant:cafe",
        value: "No qualifying transactions for merchant:cafe were found in the latest 90-day profile.",
        evidence: "Latest profile did not include this pattern.", confidence: 0.8,
        createdAt: "2026-10-13T12:00:00.000Z", sourceType: "plaid_transaction_profile",
        supersedesId: "old-profile", sourceMetadata: { profileStatus: "absent", lookbackDays: 90 } }];
      return [];
    });
    const repository = new PostgresMemoryRepository(database, 30_000, embeddingProvider);
    const saved = await repository.rememberFinancialProfile({
      userId: "user-a", source: "plaid_transactions", generatedAt: "2026-10-13T12:00:00.000Z", lookbackDays: 90,
      facts: [], metadataAvailability: { checkedTransactionCount: 0, hasEnrichableMetadata: false,
        fields: { detailedCategory: { availableCount: 0, coverage: 0 }, merchantEntityId: { availableCount: 0, coverage: 0 },
          paymentChannel: { availableCount: 0, coverage: 0 } } }
    });

    expect(saved).toMatchObject([{ id: "inactive-profile", supersedesId: "old-profile", sourceMetadata: { profileStatus: "absent" } }]);
    expect(database.calls).toHaveLength(2);
    expect(database.calls[1]?.values).toContain("old-profile");
  });

});
