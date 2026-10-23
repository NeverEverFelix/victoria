import { MockLlmAdapter } from "../../agent/llm/mock-llm.js";
import { MockMemoryProvider } from "../../agent/memory/mock-memory.js";
import { MockVictoriaTools } from "../../agent/tools/mock-tools.js";
import { VictoriaAgent } from "../../agent/victoria-agent.js";
import { OpenAiConversationalMemoryExtractor } from "../../agent/memory/openai-conversational-memory-extractor.js";
import { OpenAiEpisodicMemorySummarizer } from "../../agent/memory/openai-episodic-memory-summarizer.js";
import { MockProfileTransactionHistoryProvider } from "../financial-profile/mock-profile-transaction-history-provider.js";
import type { TransactionFinancialProfile } from "../../domain/financial-profile.js";
import { parseVictoriaEnv } from "../../config/env.js";
import { PostgresMemoryRepository } from "../../agent/memory/postgres-memory-repository.js";
import { MemoryOrchestrator } from "../../agent/memory/memory-orchestrator.js";
import { OpenAiEmbeddingProvider } from "../../agent/memory/openai-embedding-provider.js";
import { SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS } from "../../agent/memory/semantic-embedding.js";
import { createPostgresTurnStore } from "../turns/postgres-pool.js";
import { createVictoriaSessionAuthenticator } from "./signed-session-auth.js";
import { createVictoriaChatHandler } from "./victoria-chat-handler.js";
import { createHash } from "node:crypto";
import { randomUUID } from "node:crypto";
import { PostgresPendingAmountClarificationStore } from "../clarifications/postgres-pending-amount-clarification-store.js";
import { PostgresPendingSavingsActionStore } from "../savings/postgres-pending-savings-action-store.js";
import { PostgresMockSavingsTools } from "../savings/postgres-mock-savings-tools.js";
import { PostgresPendingGoalAllocationActionStore } from "../savings/postgres-pending-goal-allocation-store.js";
import { PostgresConversationCoordinator } from "../turns/postgres-conversation-coordinator.js";
import { createMemoryManagementHandlers } from "./memory-management-handler.js";
import { createConversationFinishHandler } from "./conversation-finish-handler.js";

export interface LocalMockVictoriaRuntime {
  readonly handler: ReturnType<typeof createVictoriaChatHandler>;
  readonly finishHandler: ReturnType<typeof createConversationFinishHandler>;
  readonly memoryManagementHandler?: ReturnType<typeof createMemoryManagementHandlers>;
  /** Adapter for a mock or injected sync service to publish its refreshed profile to chat. */
  readonly financialProfileWriter: {
    rememberFinancialProfile(profile: TransactionFinancialProfile): Promise<readonly unknown[]>;
  };
}

let cachedRuntime: { readonly cacheKey: string; readonly runtime: LocalMockVictoriaRuntime } | undefined;
const persistentPools = new Map<string, ReturnType<typeof createPostgresTurnStore>["pool"]>();

/** Creates a local chat runtime with mock model/tools by default; all other environments fail closed. */
export function getLocalMockVictoriaRuntime(env: Record<string, string | undefined> = process.env): LocalMockVictoriaRuntime | null {
  if (env.APP_ENV !== "local" || env.NODE_ENV !== "development") return null;
  const secret = env.AUTH_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32 || /(?:replace|example|placeholder|changeme)/i.test(secret)) return null;
  const openAiKey = env.OPENAI_API_KEY?.trim();
  const embeddingsEnabled = Boolean(openAiKey) &&
    !/(?:local-openai|replace|example|placeholder|changeme)/i.test(openAiKey ?? "");
  const persistentMemoryEnabled = env.VICTORIA_MEMORY_MODE === "persistent";
  if (env.VICTORIA_MEMORY_MODE !== undefined && env.VICTORIA_MEMORY_MODE !== "mock" && !persistentMemoryEnabled) return null;
  let persistentMemory: MemoryOrchestrator | undefined;
  let pendingAmountClarificationStore: PostgresPendingAmountClarificationStore | undefined;
  let pendingSavingsActionStore: PostgresPendingSavingsActionStore | undefined;
  let pendingGoalAllocationActionStore: PostgresPendingGoalAllocationActionStore | undefined;
  let persistentSavingsTools: PostgresMockSavingsTools | undefined;
  let conversationCoordinator: PostgresConversationCoordinator | undefined;
  let persistentMemoryKey = "mock-memory";
  if (persistentMemoryEnabled) {
    try {
      // Persistent mode is deliberately local-only in this slice. parseVictoriaEnv
      // enforces a loopback *_local database and a strong local session secret.
      const config = parseVictoriaEnv(env);
      if (config.appEnv !== "local" || config.nodeEnv !== "development") return null;
      persistentMemoryKey = createHash("sha256").update(config.databaseUrl).digest("hex");
      let pool = persistentPools.get(config.databaseUrl);
      if (!pool) {
        pool = createPostgresTurnStore(config.databaseUrl, { maxPoolSize: 2 }).pool;
        persistentPools.set(config.databaseUrl, pool);
      }
      const embeddings = embeddingsEnabled
          ? new OpenAiEmbeddingProvider({
            apiKey: openAiKey!,
            ...(env.OPENAI_EMBEDDING_MODEL?.trim()
              ? { model: env.OPENAI_EMBEDDING_MODEL.trim() }
              : {}),
            dimensions: SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS
          })
        : undefined;
      const repository = new PostgresMemoryRepository(pool, undefined, embeddings);
      persistentMemory = new MemoryOrchestrator(repository, { financialProfiles: repository });
      pendingAmountClarificationStore = new PostgresPendingAmountClarificationStore(pool);
      pendingSavingsActionStore = new PostgresPendingSavingsActionStore(pool);
      pendingGoalAllocationActionStore = new PostgresPendingGoalAllocationActionStore(pool);
      persistentSavingsTools = new PostgresMockSavingsTools(pool);
      conversationCoordinator = new PostgresConversationCoordinator(pool);
    } catch {
      return null;
    }
  }
  // Learning from explicit user turns is enabled when a real provider is configured.
  // Episodic summaries remain a separate, explicit opt-in because they persist a
  // synthesized account of conversation context for longer-term retrieval.
  const memoryExtractorEnabled = env.OPENAI_MEMORY_EXTRACTION_ENABLED !== "false" &&
    Boolean(openAiKey) && !/(?:local-openai|replace|example|placeholder|changeme)/i.test(openAiKey ?? "") &&
    Boolean(env.OPENAI_MODEL?.trim()) && env.OPENAI_MODEL !== "mock";
  const episodicSummariesEnabled = env.OPENAI_EPISODIC_SUMMARIES_ENABLED === "true" &&
    Boolean(openAiKey) && !/(?:local-openai|replace|example|placeholder|changeme)/i.test(openAiKey ?? "") &&
    Boolean(env.OPENAI_MODEL?.trim()) && env.OPENAI_MODEL !== "mock";
  const cacheKey = createHash("sha256")
    .update(secret).update("\0").update(persistentMemoryKey)
    .update("\0").update(embeddingsEnabled ? createHash("sha256").update(openAiKey!).digest("hex") : "no-embeddings")
    .update("\0").update(env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small")
    .update("\0").update(memoryExtractorEnabled ? openAiKey! : "mock")
    .update("\0").update(env.OPENAI_MODEL ?? "mock")
    .update("\0").update(episodicSummariesEnabled ? "episodes-on" : "episodes-off").digest("hex");
  if (cachedRuntime?.cacheKey === cacheKey) return cachedRuntime.runtime;
  const transactionHistory = new MockProfileTransactionHistoryProvider();
  const agent = new VictoriaAgent({
    llm: new MockLlmAdapter(),
    memory: persistentMemory ?? new MockMemoryProvider(),
    tools: persistentSavingsTools ?? new MockVictoriaTools(),
    ...(pendingAmountClarificationStore ? { pendingAmountClarifications: pendingAmountClarificationStore } : {}),
    ...(pendingSavingsActionStore ? { pendingSavingsActions: pendingSavingsActionStore, idFactory: randomUUID } : {}),
    ...(pendingGoalAllocationActionStore ? { pendingGoalAllocationActions: pendingGoalAllocationActionStore } : {}),
    transactionHistory,
    ...(memoryExtractorEnabled ? {
      conversationalMemoryExtractor: new OpenAiConversationalMemoryExtractor({
        apiKey: openAiKey!, model: env.OPENAI_MODEL!
      })
    } : {}),
    ...(episodicSummariesEnabled ? {
      episodicMemorySummarizer: new OpenAiEpisodicMemorySummarizer({
        apiKey: openAiKey!, model: env.OPENAI_MODEL!
      })
    } : {})
  });
  const handler = createVictoriaChatHandler({
    authenticate: createVictoriaSessionAuthenticator(secret),
    agent,
    ...(conversationCoordinator ? { conversationCoordinator } : {})
  });
  const finishHandler = createConversationFinishHandler({
    authenticate: createVictoriaSessionAuthenticator(secret),
    agent,
    ...(conversationCoordinator ? { conversationCoordinator } : {})
  });
  const memoryManagementHandler = persistentMemory
    ? createMemoryManagementHandlers({
        authenticate: createVictoriaSessionAuthenticator(secret),
        memory: persistentMemory
      })
    : undefined;
  const runtime = Object.freeze({
    handler,
    finishHandler,
    ...(memoryManagementHandler ? { memoryManagementHandler } : {}),
    financialProfileWriter: Object.freeze({
      rememberFinancialProfile: async (profile: TransactionFinancialProfile) => {
        transactionHistory.setProfile(profile);
        return persistentMemory
          ? persistentMemory.rememberFinancialProfile(profile)
          : Object.freeze([]);
      }
    })
  });
  cachedRuntime = Object.freeze({ cacheKey, runtime });
  return runtime;
}

export function getLocalMockVictoriaChatHandler(env: Record<string, string | undefined> = process.env) {
  return getLocalMockVictoriaRuntime(env)?.handler ?? null;
}

/** Closes PostgreSQL pools created by the opt-in local runtime (used at shutdown and in integration tests). */
export async function closeLocalPersistentMemoryPools(): Promise<void> {
  const pools = [...persistentPools.values()];
  persistentPools.clear();
  cachedRuntime = undefined;
  await Promise.all(pools.map((pool) => pool.end()));
}
