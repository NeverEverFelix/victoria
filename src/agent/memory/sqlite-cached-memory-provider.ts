import { DatabaseSync } from "node:sqlite";
import type { AgentMemory, FinancialDecision, SavingsGoal, UserHabit } from "../types.js";
import type { ConversationMessage, ConversationalMemory, ConversationalMemoryPage, MemoryProvider } from "./types.js";
import { DEFAULT_CONVERSATION_CONTEXT_LIMIT } from "./types.js";
import { PostgresMemoryRepository } from "./postgres-memory-repository.js";
import { conversationMessagesFromLegacy, isConversationMessage, legacyConversationContext } from "./conversation-transcript.js";

/** SQLite owns short-term context and caches durable PostgreSQL conversational memory. */
export class SqliteCachedMemoryProvider implements MemoryProvider {
  private readonly db: DatabaseSync;
  private readonly shortTermContextTtlMs: number;
  private readonly pendingContextFlushes = new Set<Promise<void>>();
  private readonly pendingContextFlushKeys = new Set<string>();
  private readonly expirySweep: NodeJS.Timeout;

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
    this.purgeExpiredContext();
    this.expirySweep = setInterval(() => {
      this.purgeExpiredContext();
      void this.retryPendingContextBackups();
    }, 60_000);
    this.expirySweep.unref();
  }

  async getMemoryForUser(userId: string, query?: string): Promise<AgentMemory> {
    if (query?.trim()) return this.durable.getMemoryForUser(userId, query);
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

  listCurrentConversationalMemories(
    userId: string,
    includeForgottenMarkers = false,
    page?: ConversationalMemoryPage
  ): Promise<readonly ConversationalMemory[]> {
    return this.durable.listCurrentConversationalMemories(userId, includeForgottenMarkers, page);
  }

  filterCurrentConversationalMemoryIds(userId: string, candidateIds: readonly string[]): Promise<ReadonlySet<string>> {
    return this.durable.filterCurrentConversationalMemoryIds(userId, candidateIds);
  }

  searchConversationalMemories(userId: string, query: string, limit = 20): Promise<readonly ConversationalMemory[]> {
    return this.durable.searchConversationalMemories(userId, query, limit);
  }

  async rememberConversationalMemory(
    userId: string, memory: Omit<ConversationalMemory, "id" | "createdAt">
  ): Promise<ConversationalMemory> {
    const saved = await this.durable.rememberConversationalMemory(userId, memory);
    this.db.prepare("DELETE FROM memory_cache WHERE user_id = ?").run(userId);
    return saved;
  }

  invalidateUserMemoryCache(userId: string): void {
    this.db.prepare("DELETE FROM memory_cache WHERE user_id = ?").run(userId);
  }

  listHabits(userId: string): Promise<UserHabit[]> { return this.durable.listHabits(userId); }
  listGoals(userId: string): Promise<SavingsGoal[]> { return this.durable.listGoals(userId); }

  async getConversationContext(userId: string, conversationId: string): Promise<readonly string[]> {
    this.purgeExpiredContext();
    const row = this.db.prepare(`SELECT messages, expires_at FROM conversation_context_cache
      WHERE user_id = ? AND conversation_id = ?`).get(userId, conversationId) as { messages: string; expires_at: number } | undefined;
    if (row) {
      if (row.expires_at > Date.now()) {
        this.scheduleContextFlush(userId, conversationId);
        const parsed: unknown = JSON.parse(row.messages);
        return Array.isArray(parsed) && parsed.every(isConversationMessage)
          ? legacyConversationContext(parsed as ConversationMessage[])
          : Array.isArray(parsed) ? parsed.filter((item): item is string => typeof item === "string") : [];
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
    this.purgeExpiredContext();
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

  async getConversationMessages(userId: string, conversationId: string): Promise<readonly ConversationMessage[]> {
    this.purgeExpiredContext();
    const row = this.db.prepare(`SELECT messages, expires_at FROM conversation_context_cache
      WHERE user_id = ? AND conversation_id = ?`).get(userId, conversationId) as { messages: string; expires_at: number } | undefined;
    if (row && row.expires_at > Date.now()) {
      this.scheduleContextFlush(userId, conversationId);
      const parsed: unknown = JSON.parse(row.messages);
      return Array.isArray(parsed) && parsed.every(isConversationMessage)
        ? Object.freeze(parsed as ConversationMessage[])
        : conversationMessagesFromLegacy(conversationId, Array.isArray(parsed)
          ? parsed.filter((item): item is string => typeof item === "string") : []);
    }
    if (row) {
      this.db.prepare("DELETE FROM conversation_context_cache WHERE user_id = ? AND conversation_id = ?").run(userId, conversationId);
      this.db.prepare("DELETE FROM conversation_context_outbox WHERE user_id = ? AND conversation_id = ?").run(userId, conversationId);
    }
    try {
      const messages = await this.durable.getConversationMessages(userId, conversationId);
      const expiresAt = Date.now() + this.shortTermContextTtlMs;
      this.cacheRawConversationMessages(userId, conversationId, messages, expiresAt);
      return messages;
    } catch {
      const legacy = await this.durable.getConversationContext(userId, conversationId).catch(() => []);
      return conversationMessagesFromLegacy(conversationId, legacy);
    }
  }

  async setConversationMessages(userId: string, conversationId: string, messages: readonly ConversationMessage[]): Promise<void> {
    this.purgeExpiredContext();
    const bounded = messages.slice(-this.contextMessageLimit);
    const expiresAt = Date.now() + this.shortTermContextTtlMs;
    this.db.exec("BEGIN IMMEDIATE");
    try {
      this.cacheRawConversationMessages(userId, conversationId, bounded, expiresAt);
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

  async retryPendingContextBackups(): Promise<void> {
    const rows = this.db.prepare(`SELECT user_id, conversation_id FROM conversation_context_outbox
      WHERE expires_at > ?`).all(Date.now()) as Array<{ user_id: string; conversation_id: string }>;
    for (const row of rows) this.scheduleContextFlush(row.user_id, row.conversation_id);
    await this.flushPendingContextBackups();
  }

  /** Removes expired local cache and outbox payloads, including after a restart. */
  purgeExpiredContext(now = Date.now()): { readonly cacheRows: number; readonly outboxRows: number } {
    const cacheRows = Number(this.db.prepare("DELETE FROM conversation_context_cache WHERE expires_at <= ?").run(now).changes);
    const outboxRows = Number(this.db.prepare("DELETE FROM conversation_context_outbox WHERE expires_at <= ?").run(now).changes);
    return Object.freeze({ cacheRows, outboxRows });
  }

  private scheduleContextFlush(userId: string, conversationId: string): void {
    const key = `${userId}\u0000${conversationId}`;
    if (this.pendingContextFlushKeys.has(key)) return;
    this.pendingContextFlushKeys.add(key);
    const flush = this.flushContextOutbox(userId, conversationId);
    this.pendingContextFlushes.add(flush);
    void flush.finally(() => {
      this.pendingContextFlushes.delete(flush);
      this.pendingContextFlushKeys.delete(key);
    });
  }

  private cacheShortTermContext(userId: string, conversationId: string, messages: readonly string[], expiresAt: number): void {
    this.db.prepare("INSERT OR REPLACE INTO conversation_context_cache VALUES (?, ?, ?, ?)")
      .run(userId, conversationId, JSON.stringify(messages.slice(-this.contextMessageLimit)), expiresAt);
  }

  private cacheRawConversationMessages(
    userId: string, conversationId: string, messages: readonly ConversationMessage[], expiresAt: number
  ): void {
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
      const messages: unknown = JSON.parse(row.messages);
      if (Array.isArray(messages) && messages.every(isConversationMessage)) {
        await this.durable.setConversationMessages(userId, conversationId, messages as ConversationMessage[]);
      } else {
        await this.durable.setConversationContext(userId, conversationId,
          Array.isArray(messages) ? messages.filter((item): item is string => typeof item === "string") : []);
      }
      this.db.prepare("DELETE FROM conversation_context_outbox WHERE user_id = ? AND conversation_id = ? AND expires_at = ?")
        .run(userId, conversationId, row.expires_at);
    } catch {
      // SQLite owns short-term context; the outbox retries on the next context access.
    }
  }

  close(): void { clearInterval(this.expirySweep); this.db.close(); }
}
