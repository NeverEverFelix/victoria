import { randomUUID } from "node:crypto";
import type { FinancialDecision, SavingsGoal, UserHabit, AgentMemory } from "../types.js";
import type { PostgresQueryable } from "../../app/turns/postgres-turn-repository.js";
import { DEFAULT_CONVERSATION_CONTEXT_LIMIT, type ConversationalMemory, type MemoryProvider } from "./types.js";
import { toPgVectorLiteral, validateSemanticEmbedding, type SemanticEmbeddingProvider } from "./semantic-embedding.js";
import type { TransactionFinancialProfile } from "../../domain/financial-profile.js";
import { formatUsd } from "../../domain/money.js";

/** Durable user-scoped conversational memory. Financial history belongs in its own repositories. */
export class PostgresMemoryRepository implements MemoryProvider {
  constructor(
    private readonly db: PostgresQueryable,
    private readonly shortTermContextTtlMs = 30 * 60_000,
    private readonly embeddings?: SemanticEmbeddingProvider
  ) {}

  async getMemoryForUser(userId: string, query?: string): Promise<AgentMemory> {
    const [habits, goals, decisions, conversationalMemories] = await Promise.all([
      this.listHabits(userId), this.listGoals(userId), this.listDecisions(userId),
      query?.trim() ? this.searchConversationalMemories(userId, query) : this.listCurrentMemories(userId)
    ]);
    return { habits, goals, recentDecisions: decisions, conversationalMemories };
  }

  async rememberDecision(userId: string, decision: Omit<FinancialDecision, "id" | "createdAt">): Promise<FinancialDecision> {
    const value: FinancialDecision = Object.freeze({ ...decision, id: `decision_${randomUUID()}`, createdAt: new Date().toISOString() });
    await this.db.query(
      "INSERT INTO victoria_memory_decisions (id, user_id, decision, created_at) VALUES ($1, $2, $3::jsonb, $4)",
      [value.id, userId, JSON.stringify(decision), value.createdAt]
    );
    return value;
  }

  async listHabits(userId: string): Promise<UserHabit[]> { void userId; return []; }
  async listGoals(userId: string): Promise<SavingsGoal[]> { void userId; return []; }

  async listDecisions(userId: string): Promise<FinancialDecision[]> {
    const result = await this.db.query<{ id: string; decision: Omit<FinancialDecision, "id" | "createdAt">; created_at: string | Date }>(
      "SELECT id, decision, created_at FROM victoria_memory_decisions WHERE user_id = $1 ORDER BY created_at DESC LIMIT 50", [userId]
    );
    return result.rows.map((row) => Object.freeze({ ...row.decision, id: row.id, createdAt: new Date(row.created_at).toISOString() }));
  }

  async getConversationContext(userId: string, conversationId: string): Promise<readonly string[]> {
    const result = await this.db.query<{ messages: string[] }>(
      "SELECT messages FROM victoria_conversation_context WHERE user_id = $1 AND conversation_id = $2 AND expires_at > now()",
      [userId, conversationId]
    );
    return result.rows[0]?.messages ?? [];
  }

  async setConversationContext(userId: string, conversationId: string, messages: readonly string[]): Promise<void> {
    await this.db.query(
      `INSERT INTO victoria_conversation_context (user_id, conversation_id, messages, updated_at, expires_at)
       VALUES ($1, $2, $3::jsonb, now(), $4)
       ON CONFLICT (user_id, conversation_id) DO UPDATE SET messages = EXCLUDED.messages,
         updated_at = EXCLUDED.updated_at, expires_at = EXCLUDED.expires_at`,
      [userId, conversationId, JSON.stringify(messages.slice(-DEFAULT_CONVERSATION_CONTEXT_LIMIT)), new Date(Date.now() + this.shortTermContextTtlMs).toISOString()]
    );
  }

  async listConversationalMemories(userId: string): Promise<readonly ConversationalMemory[]> {
    // This API exposes append-only history; getMemoryForUser/search return only current, fresh facts.
    const result = await this.db.query<ConversationalMemory>(
      `SELECT id, category, memory_key AS "key", value, evidence, confidence,
        created_at AS "createdAt", supersedes_id AS "supersedesId", source_type AS "sourceType",
        observed_from::text AS "observedFrom", observed_through::text AS "observedThrough",
        source_record_count AS "sourceRecordCount", source_metadata AS "sourceMetadata"
       FROM victoria_conversational_memories WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [userId]
    );
    return result.rows.map((row) => Object.freeze(row));
  }

  async searchConversationalMemories(userId: string, query: string, limit = 20): Promise<readonly ConversationalMemory[]> {
    if (!userId.trim() || !query.trim()) return [];
    const boundedLimit = Math.max(1, Math.min(Number.isSafeInteger(limit) ? limit : 20, 50));
    if (!this.embeddings) return (await this.listCurrentMemories(userId)).slice(0, boundedLimit);
    try {
      const vector = await this.embeddings.embed(query);
      if (!validateSemanticEmbedding(vector)) return (await this.listCurrentMemories(userId)).slice(0, boundedLimit);
      const result = await this.db.query<ConversationalMemory>(
        `SELECT id, category, key, value, evidence, confidence, created_at AS "createdAt",
          supersedes_id AS "supersedesId", source_type AS "sourceType",
          observed_from::text AS "observedFrom", observed_through::text AS "observedThrough",
          source_record_count AS "sourceRecordCount", source_metadata AS "sourceMetadata"
         FROM victoria_search_conversational_memories($1, $2::extensions.vector(1536), $3, $4)`,
        [userId, toPgVectorLiteral(vector), this.embeddings.modelId, boundedLimit]
      );
      return result.rows.map((row) => Object.freeze(row));
    } catch {
      // The durable recent-memory path remains available if embedding or vector search is unavailable.
      return (await this.listCurrentMemories(userId)).slice(0, boundedLimit);
    }
  }

  private async listCurrentMemories(userId: string): Promise<readonly ConversationalMemory[]> {
    const result = await this.db.query<ConversationalMemory>(
      `SELECT m.id, m.category, m.memory_key AS "key", m.value, m.evidence, m.confidence,
        m.created_at AS "createdAt", m.supersedes_id AS "supersedesId", m.source_type AS "sourceType",
        m.observed_from::text AS "observedFrom", m.observed_through::text AS "observedThrough",
        m.source_record_count AS "sourceRecordCount", m.source_metadata AS "sourceMetadata"
       FROM victoria_conversational_memories m WHERE m.user_id = $1
         AND (m.source_type <> 'plaid_transaction_profile' OR m.observed_through >= current_date - 90)
         AND NOT EXISTS (SELECT 1 FROM victoria_conversational_memories newer
           WHERE newer.user_id = m.user_id AND newer.supersedes_id = m.id)
       ORDER BY m.created_at DESC LIMIT 100`, [userId]
    );
    return result.rows.map((row) => Object.freeze(row));
  }

  async rememberConversationalMemory(
    userId: string, memory: Omit<ConversationalMemory, "id" | "createdAt">
  ): Promise<ConversationalMemory> {
    if (!userId.trim() || !memory.key.trim() || !memory.value.trim() || !memory.evidence.trim() ||
        !Number.isFinite(memory.confidence) || memory.confidence < 0 || memory.confidence > 1) {
      throw new Error("Conversational memory must have a user, key, value, evidence, and confidence from 0 to 1.");
    }
    const id = `memory_${randomUUID()}`;
    const sourceType = memory.sourceType ?? "user_statement";
    if (!(sourceType === "user_statement" || sourceType === "plaid_transaction_profile" ||
        sourceType === "system_inference" || sourceType === "user_correction") ||
        (memory.sourceRecordCount !== undefined && (!Number.isSafeInteger(memory.sourceRecordCount) || memory.sourceRecordCount <= 0)) ||
        (memory.sourceMetadata !== undefined && (!memory.sourceMetadata || typeof memory.sourceMetadata !== "object" || Array.isArray(memory.sourceMetadata)))) {
      throw new Error("Conversational memory source metadata is invalid.");
    }
    const result = await this.db.query<ConversationalMemory>(
      `INSERT INTO victoria_conversational_memories
        (id, user_id, category, memory_key, value, evidence, confidence, supersedes_id,
         source_type, observed_from, observed_through, source_record_count, source_metadata)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13::jsonb)
       RETURNING id, category, memory_key AS "key", value, evidence, confidence,
         created_at AS "createdAt", supersedes_id AS "supersedesId", source_type AS "sourceType",
         observed_from::text AS "observedFrom", observed_through::text AS "observedThrough",
         source_record_count AS "sourceRecordCount", source_metadata AS "sourceMetadata"`,
      [id, userId, memory.category, memory.key, memory.value, memory.evidence, memory.confidence,
        memory.supersedesId ?? null, sourceType, memory.observedFrom ?? null, memory.observedThrough ?? null,
        memory.sourceRecordCount ?? null, memory.sourceMetadata === undefined ? null : JSON.stringify(memory.sourceMetadata)]
    );
    const saved = result.rows[0];
    if (!saved) throw new Error("PostgreSQL did not return the stored conversational memory.");
    if (memory.sourceMetadata?.profileStatus !== "absent") {
      await this.storeEmbedding(userId, saved.id, `${saved.category}: ${saved.key}. ${saved.value}`);
    }
    return Object.freeze(saved);
  }

  async rememberFinancialProfile(profile: TransactionFinancialProfile): Promise<readonly ConversationalMemory[]> {
    if (!profile.userId.trim() || profile.source !== "plaid_transactions") throw new Error("Invalid transaction profile.");
    const memories: ConversationalMemory[] = [];
    const currentProfiles = await this.db.query<{
      id: string; key: string; value: string; confidence: number; sourceMetadata: Record<string, unknown>;
    }>(`SELECT m.id, m.memory_key AS key, m.value, m.confidence, m.source_metadata AS "sourceMetadata"
       FROM victoria_conversational_memories m
       WHERE m.user_id = $1 AND m.source_type = 'plaid_transaction_profile'
         AND m.memory_key LIKE 'financial_profile:%'
         AND NOT EXISTS (SELECT 1 FROM victoria_conversational_memories newer
           WHERE newer.user_id = m.user_id AND newer.supersedes_id = m.id)`, [profile.userId]);
    const incomingKeys = new Set(profile.facts.map((fact) => `financial_profile:${fact.dimension}:${fact.key}`));
    for (const fact of profile.facts) {
      const key = `financial_profile:${fact.dimension}:${fact.key}`;
      const value = fact.dimension === "merchant" && fact.typicalAmountCents !== null
        ? `Typical spend at ${fact.label} is ${formatUsd(fact.typicalAmountCents)} across ${fact.transactionCount} posted USD purchases; total ${formatUsd(fact.totalCents)}.`
        : `Recorded ${formatUsd(fact.totalCents)} across ${fact.transactionCount} posted USD purchases in ${fact.label}.`;
      const existing = await this.db.query<{ id: string; value: string; observed_through: string | Date | null }>(
        `SELECT m.id, m.value, m.observed_through FROM victoria_conversational_memories m
         WHERE m.user_id = $1 AND m.memory_key = $2 AND m.source_type = 'plaid_transaction_profile'
           AND NOT EXISTS (SELECT 1 FROM victoria_conversational_memories newer
             WHERE newer.user_id = m.user_id AND newer.supersedes_id = m.id)
         ORDER BY m.created_at DESC LIMIT 1`, [profile.userId, key]
      );
      const prior = existing.rows[0];
      if (prior?.value === value && toDay(prior.observed_through) === fact.observedThrough) continue;
      memories.push(await this.rememberConversationalMemory(profile.userId, {
        category: "financial_pattern",
        key,
        value,
        evidence: `Derived from ${fact.transactionCount} posted USD purchases in the ${profile.lookbackDays}-day profile window.`,
        confidence: fact.confidence,
        sourceType: "plaid_transaction_profile",
        observedFrom: fact.observedFrom,
        observedThrough: fact.observedThrough,
        sourceRecordCount: fact.transactionCount,
        sourceMetadata: { dimension: fact.dimension, currency: fact.currency,
          totalCents: fact.totalCents, typicalAmountCents: fact.typicalAmountCents,
          lookbackDays: profile.lookbackDays, profileStatus: "active" },
        ...(prior ? { supersedesId: prior.id } : {})
      }));
    }
    for (const prior of currentProfiles.rows) {
      if (incomingKeys.has(prior.key) || prior.sourceMetadata?.profileStatus === "absent") continue;
      memories.push(await this.rememberConversationalMemory(profile.userId, {
        category: "financial_pattern",
        key: prior.key,
        value: `No qualifying transactions for ${prior.key.slice("financial_profile:".length)} were found in the latest ${profile.lookbackDays}-day profile.`,
        evidence: `The completed Plaid Transactions profile generated ${profile.generatedAt} did not include this pattern.`,
        confidence: prior.confidence,
        sourceType: "plaid_transaction_profile",
        sourceMetadata: { profileStatus: "absent", lookbackDays: profile.lookbackDays },
        supersedesId: prior.id
      }));
    }
    return Object.freeze(memories);
  }

  private async storeEmbedding(userId: string, memoryId: string, text: string): Promise<void> {
    if (!this.embeddings?.modelId.trim()) return;
    try {
      const vector = await this.embeddings.embed(text);
      if (!validateSemanticEmbedding(vector)) return;
      await this.db.query(
        `INSERT INTO victoria_memory_embeddings (user_id, memory_id, embedding_model, embedding)
         VALUES ($1, $2, $3, $4::extensions.vector(1536)) ON CONFLICT DO NOTHING`,
        [userId, memoryId, this.embeddings.modelId, toPgVectorLiteral(vector)]
      );
    } catch {
      // The fact itself is durable; a later embedding pass can index it without rewriting the fact.
    }
  }
}

function toDay(value: string | Date | null): string | null {
  if (value === null) return null;
  return value instanceof Date ? value.toISOString().slice(0, 10) : value.slice(0, 10);
}
