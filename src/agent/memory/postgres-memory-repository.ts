import { randomUUID } from "node:crypto";
import type { FinancialDecision, SavingsGoal, UserHabit, AgentMemory } from "../types.js";
import type { PostgresQueryable } from "../../app/turns/postgres-turn-repository.js";
import { DEFAULT_CONVERSATION_CONTEXT_LIMIT, type ConversationalMemory, type MemoryProvider } from "./types.js";

/** Durable user-scoped conversational memory. Financial history belongs in its own repositories. */
export class PostgresMemoryRepository implements MemoryProvider {
  constructor(private readonly db: PostgresQueryable, private readonly shortTermContextTtlMs = 30 * 60_000) {}

  async getMemoryForUser(userId: string): Promise<AgentMemory> {
    const [habits, goals, decisions, conversationalMemories] = await Promise.all([
      this.listHabits(userId), this.listGoals(userId), this.listDecisions(userId), this.listConversationalMemories(userId)
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
    const result = await this.db.query<{ id: string; decision: FinancialDecision; created_at: string | Date }>(
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
      `INSERT INTO victoria_conversation_context (user_id, conversation_id, messages, updated_at)
       VALUES ($1, $2, $3::jsonb, now(), $4)
       ON CONFLICT (user_id, conversation_id) DO UPDATE SET messages = EXCLUDED.messages,
         updated_at = EXCLUDED.updated_at, expires_at = EXCLUDED.expires_at`,
      [userId, conversationId, JSON.stringify(messages.slice(-DEFAULT_CONVERSATION_CONTEXT_LIMIT)), new Date(Date.now() + this.shortTermContextTtlMs).toISOString()]
    );
  }

  async listConversationalMemories(userId: string): Promise<readonly ConversationalMemory[]> {
    const result = await this.db.query<ConversationalMemory>(
      `SELECT id, category, memory_key AS "key", value, evidence, confidence,
        created_at AS "createdAt", supersedes_id AS "supersedesId"
       FROM victoria_conversational_memories WHERE user_id = $1 ORDER BY created_at DESC LIMIT 100`, [userId]
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
    const result = await this.db.query<ConversationalMemory>(
      `INSERT INTO victoria_conversational_memories (id, user_id, category, memory_key, value, evidence, confidence, supersedes_id)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
       RETURNING id, category, memory_key AS "key", value, evidence, confidence,
         created_at AS "createdAt", supersedes_id AS "supersedesId"`,
      [id, userId, memory.category, memory.key, memory.value, memory.evidence, memory.confidence, memory.supersedesId ?? null]
    );
    const saved = result.rows[0];
    if (!saved) throw new Error("PostgreSQL did not return the stored conversational memory.");
    return Object.freeze(saved);
  }
}
