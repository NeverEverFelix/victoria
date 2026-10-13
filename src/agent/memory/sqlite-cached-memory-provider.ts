import { DatabaseSync } from "node:sqlite";
import type { AgentMemory, FinancialDecision, SavingsGoal, UserHabit } from "../types.js";
import type { ConversationalMemory, MemoryProvider } from "./types.js";
import { DEFAULT_CONVERSATION_CONTEXT_LIMIT } from "./types.js";
import { PostgresMemoryRepository } from "./postgres-memory-repository.js";

/** SQLite owns short-term context and caches durable PostgreSQL conversational memory. */
export class SqliteCachedMemoryProvider implements MemoryProvider {
  private readonly db: DatabaseSync;
  private readonly shortTermContextTtlMs: number;
  private readonly pendingContextFlushes = new Set<Promise<void>>();

  constructor(
    private readonly durable: PostgresMemoryRepository,
    databasePath = ":memory:",
    shortTermContextTtlMs = 30 * 60_000,
    private readonly contextMessageLimit = DEFAULT_CONVERSATION_CONTEXT_LIMIT
  ) {
    this.shortTermContextTtlMs = shortTermContextTtlMs;
    this.db = new DatabaseSync(databasePath);
    this.db.exec(`PRAGMA journal_mode = WAL;
      CREATE TABLE IF NOT EXISTS memory_cache (user_id TEXT PRIMARY KEY, value TEXT NOT NULL, cached_at INTEGER NOT NULL);
      CREATE TABLE IF NOT EXISTS conversation_context_cache (
        user_id TEXT NOT NULL, conversation_id TEXT NOT NULL, messages TEXT NOT NULL, expires_at INTEGER NOT NULL,
        PRIMARY KEY (user_id, conversation_id)
      );`);
    this.db.exec(`CREATE TABLE IF NOT EXISTS conversation_context_outbox (
      user_id TEXT NOT NULL, conversation_id TEXT NOT NULL, messages TEXT NOT NULL, expires_at INTEGER NOT NULL,
      PRIMARY KEY (user_id, conversation_id)
    );`);
  }

  async getMemoryForUser(userId: string): Promise<AgentMemory> {
    const row = this.db.prepare("SELECT value, cached_at FROM memory_cache WHERE user_id = ?").get(userId) as { value: string; cached_at: number } | undefined;
    if (row && Date.now() - row.cached_at < 30_000) return JSON.parse(row.value) as AgentMemory;
    const memory = await this.durable.getMemoryForUser(userId);
    this.db.prepare("INSERT OR REPLACE INTO memory_cache VALUES (?, ?, ?)").run(userId, JSON.stringify(memory), Date.now());
    return memory;
  }

  async rememberDecision(userId: string, decision: Omit<FinancialDecision, "id" | "createdAt">): Promise<FinancialDecision> {
    const saved = await this.durable.rememberDecision(userId, decision);
    this.db.prepare("DELETE FROM memory_cache WHERE user_id = ?").run(userId);
    return saved;
  }

  async listConversationalMemories(userId: string): Promise<readonly ConversationalMemory[]> {
    return (await this.getMemoryForUser(userId)).conversationalMemories ?? [];
  }

  async rememberConversationalMemory(
    userId: string, memory: Omit<ConversationalMemory, "id" | "createdAt">
  ): Promise<ConversationalMemory> {
    const saved = await this.durable.rememberConversationalMemory(userId, memory);
    this.db.prepare("DELETE FROM memory_cache WHERE user_id = ?").run(userId);
    return saved;
  }

  listHabits(userId: string): Promise<UserHabit[]> { return this.durable.listHabits(userId); }
  listGoals(userId: string): Promise<SavingsGoal[]> { return this.durable.listGoals(userId); }

  async getConversationContext(userId: string, conversationId: string): Promise<readonly string[]> {
    const row = this.db.prepare(`SELECT messages, expires_at FROM conversation_context_cache
      WHERE user_id = ? AND conversation_id = ?`).get(userId, conversationId) as { messages: string; expires_at: number } | undefined;
    if (row) {
      if (row.expires_at > Date.now()) {
        this.scheduleContextFlush(userId, conversationId);
        return JSON.parse(row.messages) as string[];
      }
      this.db.prepare("DELETE FROM conversation_context_cache WHERE user_id = ? AND conversation_id = ?").run(userId, conversationId);
      this.db.prepare("DELETE FROM conversation_context_outbox WHERE user_id = ? AND conversation_id = ?").run(userId, conversationId);
      return [];
    }
    try {
      const messages = await this.durable.getConversationContext(userId, conversationId);
      const expiresAt = Date.now() + this.shortTermContextTtlMs;
      this.cacheShortTermContext(userId, conversationId, messages, expiresAt);
      return messages;
    } catch {
      return [];
    }
  }

  async setConversationContext(userId: string, conversationId: string, messages: readonly string[]): Promise<void> {
    const bounded = messages.slice(-this.contextMessageLimit);
    const expiresAt = Date.now() + this.shortTermContextTtlMs;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.cacheShortTermContext(userId, conversationId, bounded, expiresAt);
      this.db.prepare("INSERT OR REPLACE INTO conversation_context_outbox VALUES (?, ?, ?, ?)")
        .run(userId, conversationId, JSON.stringify(bounded), expiresAt);
      this.db.exec("COMMIT");
    } catch (error) {
      this.db.exec("ROLLBACK");
      throw error;
    }
    this.scheduleContextFlush(userId, conversationId);
  }

  async flushPendingContextBackups(): Promise<void> {
    await Promise.all([...this.pendingContextFlushes]);
  }

  private scheduleContextFlush(userId: string, conversationId: string): void {
    const flush = this.flushContextOutbox(userId, conversationId);
    this.pendingContextFlushes.add(flush);
    void flush.finally(() => this.pendingContextFlushes.delete(flush));
  }

  private cacheShortTermContext(userId: string, conversationId: string, messages: readonly string[], expiresAt: number): void {
    this.db.prepare("INSERT OR REPLACE INTO conversation_context_cache VALUES (?, ?, ?, ?)")
      .run(userId, conversationId, JSON.stringify(messages.slice(-this.contextMessageLimit)), expiresAt);
  }

  private async flushContextOutbox(userId: string, conversationId: string): Promise<void> {
    const row = this.db.prepare(`SELECT messages, expires_at FROM conversation_context_outbox
      WHERE user_id = ? AND conversation_id = ?`).get(userId, conversationId) as { messages: string; expires_at: number } | undefined;
    if (!row) return;
    if (row.expires_at <= Date.now()) {
      this.db.prepare("DELETE FROM conversation_context_outbox WHERE user_id = ? AND conversation_id = ?").run(userId, conversationId);
      return;
    }
    try {
      await this.durable.setConversationContext(userId, conversationId, JSON.parse(row.messages) as string[]);
      this.db.prepare("DELETE FROM conversation_context_outbox WHERE user_id = ? AND conversation_id = ? AND expires_at = ?")
        .run(userId, conversationId, row.expires_at);
    } catch {
      // SQLite owns short-term context; the outbox retries on the next context access.
    }
  }

  close(): void { this.db.close(); }
}
