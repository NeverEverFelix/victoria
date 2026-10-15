import { describe, expect, it } from "vitest";
import { PostgresMemoryRepository } from "../../../src/agent/memory/postgres-memory-repository.js";
import { SqliteCachedMemoryProvider } from "../../../src/agent/memory/sqlite-cached-memory-provider.js";
import type { PostgresQueryable, PostgresQueryResult } from "../../../src/app/turns/postgres-turn-repository.js";

class MemoryDatabase implements PostgresQueryable {
  readonly contexts = new Map<string, string[]>();
  readonly contextInsertSql: string[] = [];
  readonly decisions: Array<{ id: string; userId: string; decision: { type: "avoided_spend"; summary: string }; createdAt: string }> = [];
  readonly memories: Array<{ id: string; userId: string; category: string; key: string; value: string; evidence: string; confidence: number; createdAt: string; supersedesId?: string }> = [];
  available = true;

  async query<Row>(sql: string, values: readonly unknown[] = []): Promise<PostgresQueryResult<Row>> {
    if (!this.available) throw new Error("postgres unavailable");
    if (sql.includes("INSERT INTO victoria_conversation_context")) {
      this.contextInsertSql.push(sql);
      this.contexts.set(`${values[0]}:${values[1]}`, JSON.parse(String(values[2])) as string[]);
      return { rows: [] };
    }
    if (sql.includes("SELECT messages FROM victoria_conversation_context")) {
      const messages = this.contexts.get(`${values[0]}:${values[1]}`);
      return { rows: (messages ? [{ messages }] : []) as Row[] };
    }
    if (sql.includes("INSERT INTO victoria_memory_decisions")) {
      this.decisions.push({ id: String(values[0]), userId: String(values[1]), decision: JSON.parse(String(values[2])) as { type: "avoided_spend"; summary: string }, createdAt: String(values[3]) });
      return { rows: [] };
    }
    if (sql.includes("INSERT INTO victoria_conversational_memories")) {
      const saved = { id: String(values[0]), userId: String(values[1]), category: String(values[2]), key: String(values[3]), value: String(values[4]), evidence: String(values[5]), confidence: Number(values[6]), createdAt: new Date().toISOString() };
      this.memories.push(saved);
      return { rows: [{ id: saved.id, category: saved.category, key: saved.key, value: saved.value, evidence: saved.evidence, confidence: saved.confidence, createdAt: saved.createdAt }] as Row[] };
    }
    if (sql.includes("FROM victoria_conversational_memories")) {
      return { rows: this.memories.filter((item) => item.userId === values[0]).map((item) => ({
        id: item.id, category: item.category, key: item.key, value: item.value,
        evidence: item.evidence, confidence: item.confidence, createdAt: item.createdAt,
        ...(item.supersedesId ? { supersedesId: item.supersedesId } : {})
      })) as Row[] };
    }
    if (sql.includes("SELECT id, decision, created_at FROM victoria_memory_decisions")) {
      return { rows: this.decisions.filter((item) => item.userId === values[0]).map((item) => ({ id: item.id, decision: item.decision, created_at: item.createdAt })) as Row[] };
    }
    return { rows: [] };
  }
}

describe("SQLite cached conversational memory", () => {
  it("persists short conversation context in PostgreSQL and isolates users and conversations", async () => {
    const database = new MemoryDatabase();
    const provider = new SqliteCachedMemoryProvider(new PostgresMemoryRepository(database));
    await provider.setConversationContext("user-a", "chat-1", ["I saved money", "I skipped coffee", "follow-up", "last detail", "bounded"]);
    await provider.flushPendingContextBackups();

    expect(database.contexts.get("user-a:chat-1")).toEqual(["I saved money", "I skipped coffee", "follow-up", "last detail", "bounded"]);
    expect(database.contextInsertSql[0]).toMatch(/messages, updated_at, expires_at\)/);
    expect(await provider.getConversationContext("user-a", "chat-1")).toEqual(["I saved money", "I skipped coffee", "follow-up", "last detail", "bounded"]);
    expect(await provider.getConversationContext("user-b", "chat-1")).toEqual([]);
    expect(await provider.getConversationContext("user-a", "chat-2")).toEqual([]);
    provider.close();
  });

  it("keeps a rolling 20-message short-term context window", async () => {
    const provider = new SqliteCachedMemoryProvider(new PostgresMemoryRepository(new MemoryDatabase()));
    const messages = Array.from({ length: 25 }, (_, index) => `message ${index + 1}`);
    await provider.setConversationContext("user-a", "chat-1", messages);
    await provider.flushPendingContextBackups();
    expect(await provider.getConversationContext("user-a", "chat-1")).toEqual(messages.slice(-20));
    provider.close();
  });

  it("stores durable user preferences with evidence and isolates them by user", async () => {
    const database = new MemoryDatabase();
    const provider = new SqliteCachedMemoryProvider(new PostgresMemoryRepository(database));
    await provider.rememberConversationalMemory("user-a", {
      category: "preference", key: "savings_amount", value: "Prefers saving $20 rather than $50.",
      evidence: "User said they prefer setting aside $20 over $50.", confidence: 0.95
    });
    expect(database.memories).toHaveLength(1);
    expect(await provider.listConversationalMemories("user-a")).toMatchObject([{ key: "savings_amount", category: "preference" }]);
    expect(await provider.listConversationalMemories("user-b")).toEqual([]);
    provider.close();
  });

  it("writes durable decisions before caching, and retrieves only the owning user's records", async () => {
    const database = new MemoryDatabase();
    const provider = new SqliteCachedMemoryProvider(new PostgresMemoryRepository(database));
    await provider.rememberDecision("user-a", { type: "avoided_spend", summary: "Skipped coffee." });

    expect(database.decisions).toHaveLength(1);
    expect((await provider.getMemoryForUser("user-a")).recentDecisions).toMatchObject([{ summary: "Skipped coffee." }]);
    expect((await provider.getMemoryForUser("user-b")).recentDecisions).toEqual([]);
    provider.close();
  });

  it("keeps short-term context in SQLite during a PostgreSQL outage and backs it up on retry", async () => {
    const database = new MemoryDatabase();
    database.available = false;
    const provider = new SqliteCachedMemoryProvider(new PostgresMemoryRepository(database));
    await provider.setConversationContext("user-a", "chat-1", ["clarification"]);
    expect(await provider.getConversationContext("user-a", "chat-1")).toEqual(["clarification"]);
    expect(database.contexts.has("user-a:chat-1")).toBe(false);
    database.available = true;
    expect(await provider.getConversationContext("user-a", "chat-1")).toEqual(["clarification"]);
    await provider.flushPendingContextBackups();
    expect(database.contexts.get("user-a:chat-1")).toEqual(["clarification"]);
    provider.close();
  });

  it("expires short-term context", async () => {
    const provider = new SqliteCachedMemoryProvider(new PostgresMemoryRepository(new MemoryDatabase()), ":memory:", 0);
    await provider.setConversationContext("user-a", "chat-1", ["temporary clarification"]);
    expect(await provider.getConversationContext("user-a", "chat-1")).toEqual([]);
    provider.close();
  });
});
