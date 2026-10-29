import { MockLlmAdapter } from "../../agent/llm/mock-llm.js";
import { createOpenAiAgentTeamSpecialists } from "../../agent/team/openai-specialists.js";
import { OpenAiContextReferenceResolver } from "../../agent/context-reference-resolver.js";
import { OpenAiConversationResponder } from "../../agent/conversation-responder.js";
import { MockMemoryProvider } from "../../agent/memory/mock-memory.js";
import { MockVictoriaTools } from "../../agent/tools/mock-tools.js";
import { VictoriaAgent } from "../../agent/victoria-agent.js";
import { OpenAiConversationalMemoryExtractor } from "../../agent/memory/openai-conversational-memory-extractor.js";
import { OpenAiPersonalizedReply } from "../../agent/memory/openai-personalized-reply.js";
import { OpenAiEpisodicMemorySummarizer } from "../../agent/memory/openai-episodic-memory-summarizer.js";
import { MockProfileTransactionHistoryProvider } from "../financial-profile/mock-profile-transaction-history-provider.js";
import type { TransactionFinancialProfile } from "../../domain/financial-profile.js";
import { parseVictoriaEnv, resolveVictoriaRuntimeProfile } from "../../config/env.js";
import { PostgresMemoryRepository } from "../../agent/memory/postgres-memory-repository.js";
import { MemoryOrchestrator } from "../../agent/memory/memory-orchestrator.js";
import { OpenAiEmbeddingProvider } from "../../agent/memory/openai-embedding-provider.js";
import { SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS } from "../../agent/memory/semantic-embedding.js";
import { createPostgresTurnStore } from "../turns/postgres-pool.js";
import { createVictoriaSessionAuthenticator } from "./signed-session-auth.js";
import { createVictoriaChatHandler } from "./victoria-chat-handler.js";
import { createHash, createHmac } from "node:crypto";
import { randomUUID } from "node:crypto";
import { PostgresPendingAmountClarificationStore } from "../clarifications/postgres-pending-amount-clarification-store.js";
import { PostgresPendingSavingsActionStore } from "../savings/postgres-pending-savings-action-store.js";
import { PostgresMockSavingsTools } from "../savings/postgres-mock-savings-tools.js";
import { PostgresConversationSavingsEventStore } from "../savings/postgres-conversation-savings-event-store.js";
import { PostgresPendingGoalAllocationActionStore } from "../savings/postgres-pending-goal-allocation-store.js";
import { PostgresPendingEntryCorrectionStore } from "../savings/postgres-pending-entry-correction-store.js";
import { PostgresConversationCoordinator } from "../turns/postgres-conversation-coordinator.js";
import { PostgresTurnRepository } from "../turns/postgres-turn-repository.js";
import { createQueuedTurnProcessor } from "../turns/queued-turn-processor.js";
import { createMemoryManagementHandlers } from "./memory-management-handler.js";
import { createConversationFinishHandler } from "./conversation-finish-handler.js";
import { createTurnResultHandler } from "./turn-result-handler.js";
import { createQueuedTurnProcessHandler } from "./queued-turn-process-handler.js";
import { createSubmitTurnHandler } from "./submit-turn-handler.js";

export interface LocalMockVictoriaRuntime {
  readonly handler: ReturnType<typeof createVictoriaChatHandler>;
  readonly finishHandler: ReturnType<typeof createConversationFinishHandler>;
  readonly processQueuedTurn?: ReturnType<typeof createQueuedTurnProcessor>;
  readonly turnResultHandler?: ReturnType<typeof createTurnResultHandler>;
  readonly processQueuedTurnHandler?: ReturnType<typeof createQueuedTurnProcessHandler>;
  readonly submitTurnHandler?: ReturnType<typeof createSubmitTurnHandler>;
  readonly memoryManagementHandler?: ReturnType<typeof createMemoryManagementHandlers>;
  /** Adapter for a mock or injected sync service to publish its refreshed profile to chat. */
  readonly financialProfileWriter: {
    rememberFinancialProfile(profile: TransactionFinancialProfile): Promise<readonly unknown[]>;
  };
}

let cachedRuntime: { readonly cacheKey: string; readonly runtime: LocalMockVictoriaRuntime } | undefined;
const persistentPools = new Map<string, ReturnType<typeof createPostgresTurnStore>["pool"]>();

/** Creates the local chat runtime; a configured provider is used automatically. */
export function getLocalMockVictoriaRuntime(env: Record<string, string | undefined> = process.env): LocalMockVictoriaRuntime | null {
  if (env.APP_ENV !== "local" || env.NODE_ENV !== "development") return null;
  const secret = env.AUTH_SECRET?.trim();
  if (!secret || Buffer.byteLength(secret, "utf8") < 32 || /(?:replace|example|placeholder|changeme)/i.test(secret)) return null;
  const openAiKey = env.OPENAI_API_KEY?.trim();
  const hasRealOpenAiKey = Boolean(openAiKey) &&
    !/(?:local-openai|replace|example|placeholder|changeme)/i.test(openAiKey ?? "");
  const embeddingsEnabled = hasRealOpenAiKey;
  const runtimeProfile = resolveVictoriaRuntimeProfile({
    appEnv: "local",
    providerConfigured: hasRealOpenAiKey && Boolean(env.OPENAI_MODEL?.trim()) && env.OPENAI_MODEL !== "mock"
  });
  const providerEnabled = runtimeProfile === "local_provider";
  const persistentMemoryEnabled = Boolean(env.DATABASE_URL?.trim());
  let persistentMemory: MemoryOrchestrator | undefined;
  let pendingAmountClarificationStore: PostgresPendingAmountClarificationStore | undefined;
  let pendingSavingsActionStore: PostgresPendingSavingsActionStore | undefined;
  let pendingGoalAllocationActionStore: PostgresPendingGoalAllocationActionStore | undefined;
  let pendingEntryCorrectionStore: PostgresPendingEntryCorrectionStore | undefined;
  let persistentSavingsTools: PostgresMockSavingsTools | undefined;
  let savingsEventStore: PostgresConversationSavingsEventStore | undefined;
  let conversationCoordinator: PostgresConversationCoordinator | undefined;
  let turnRepository: PostgresTurnRepository | undefined;
  let persistentMemoryKey = "mock-memory";
  if (persistentMemoryEnabled) {
    try {
      // PostgreSQL-backed local chat is deliberately local-only. parseVictoriaEnv
      // enforces a loopback *_local database and a strong local session secret.
      const config = parseVictoriaEnv(env);
      if (config.appEnv !== "local" || config.nodeEnv !== "development") return null;
      persistentMemoryKey = createHash("sha256").update(config.databaseUrl).digest("hex");
      let pool = persistentPools.get(config.databaseUrl);
      if (!pool) {
        pool = createPostgresTurnStore(config.databaseUrl, { maxPoolSize: 2 }).pool;
        persistentPools.set(config.databaseUrl, pool);
      }
      turnRepository = new PostgresTurnRepository(pool);
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
      pendingEntryCorrectionStore = new PostgresPendingEntryCorrectionStore(pool);
      persistentSavingsTools = new PostgresMockSavingsTools(pool);
      savingsEventStore = new PostgresConversationSavingsEventStore(pool);
      conversationCoordinator = new PostgresConversationCoordinator(pool);
    } catch {
      return null;
    }
  }
  // Learning from explicit user turns is enabled when a real provider is configured.
  // Episode summaries are enabled with real provider credentials by default;
  // the mock/placeholder example configuration still makes no provider calls.
  const memoryExtractorEnabled = env.OPENAI_MEMORY_EXTRACTION_ENABLED !== "false" &&
    Boolean(openAiKey) && !/(?:local-openai|replace|example|placeholder|changeme)/i.test(openAiKey ?? "") &&
    Boolean(env.OPENAI_MODEL?.trim()) && env.OPENAI_MODEL !== "mock";
  const personalizedRepliesEnabled = env.OPENAI_PERSONALIZED_REPLIES_ENABLED !== "false" &&
    Boolean(openAiKey) && !/(?:local-openai|replace|example|placeholder|changeme)/i.test(openAiKey ?? "") &&
    Boolean(env.OPENAI_MODEL?.trim()) && env.OPENAI_MODEL !== "mock";
  const episodicSummariesEnabled = env.OPENAI_EPISODIC_SUMMARIES_ENABLED !== "false" &&
    Boolean(openAiKey) && !/(?:local-openai|replace|example|placeholder|changeme)/i.test(openAiKey ?? "") &&
    Boolean(env.OPENAI_MODEL?.trim()) && env.OPENAI_MODEL !== "mock";
  const cacheKey = createHash("sha256")
    .update(secret).update("\0").update(persistentMemoryKey)
    .update("\0").update(embeddingsEnabled ? createHash("sha256").update(openAiKey!).digest("hex") : "no-embeddings")
    .update("\0").update(env.OPENAI_EMBEDDING_MODEL ?? "text-embedding-3-small")
    .update("\0").update(memoryExtractorEnabled ? openAiKey! : "mock")
    .update("\0").update(env.OPENAI_MODEL ?? "mock")
    .update("\0").update(providerEnabled ? "provider-on" : "provider-off")
    .update("\0").update(personalizedRepliesEnabled ? "personalized-replies-on" : "personalized-replies-off")
    .update("\0").update(episodicSummariesEnabled ? "episodes-on" : "episodes-off").digest("hex");
  if (cachedRuntime?.cacheKey === cacheKey) return cachedRuntime.runtime;
  const transactionHistory = new MockProfileTransactionHistoryProvider();
  const agent = new VictoriaAgent({
    llm: new MockLlmAdapter(),
    memory: persistentMemory ?? new MockMemoryProvider(),
    tools: persistentSavingsTools ?? new MockVictoriaTools(),
    ...(savingsEventStore ? { savingsEvents: savingsEventStore } : {}),
    ...(pendingAmountClarificationStore ? { pendingAmountClarifications: pendingAmountClarificationStore } : {}),
    ...(pendingSavingsActionStore ? { pendingSavingsActions: pendingSavingsActionStore, idFactory: randomUUID } : {}),
    ...(pendingGoalAllocationActionStore ? { pendingGoalAllocationActions: pendingGoalAllocationActionStore } : {}),
    ...(pendingEntryCorrectionStore ? { pendingEntryCorrections: pendingEntryCorrectionStore } : {}),
    ...(providerEnabled ? {
      specialists: createOpenAiAgentTeamSpecialists({ apiKey: openAiKey!, model: env.OPENAI_MODEL! })
    } : {}),
    ...(providerEnabled ? {
      contextReferenceResolver: new OpenAiContextReferenceResolver({ apiKey: openAiKey!, model: env.OPENAI_MODEL! })
    } : {}),
    ...(providerEnabled ? {
      conversationResponder: new OpenAiConversationResponder({ apiKey: openAiKey!, model: env.OPENAI_MODEL! })
    } : {}),
    transactionHistory,
    ...(memoryExtractorEnabled ? {
      conversationalMemoryExtractor: new OpenAiConversationalMemoryExtractor({
        apiKey: openAiKey!, model: env.OPENAI_MODEL!
      })
    } : {}),
    ...(memoryExtractorEnabled ? {
      onConversationalMemoryExtractionFailure: (errorName: string) => {
        console.warn("Victoria conversational memory extraction failed; continuing without provider-derived memories.", { errorName });
      }
    } : {}),
    onCompanionVoiceValidationFailure: (issues) => {
      console.warn("Victoria companion voice draft remained invalid after revision; using guarded fallback.", { issues });
    },
    ...(personalizedRepliesEnabled ? {
      personalizedReplyPersonalizer: new OpenAiPersonalizedReply({ apiKey: openAiKey!, model: env.OPENAI_MODEL! })
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
    ...(conversationCoordinator ? { conversationCoordinator } : {}),
    ...(turnRepository ? { turns: turnRepository } : {})
  });
  const processQueuedTurn = turnRepository
    ? createQueuedTurnProcessor({ turns: turnRepository, agent, ...(conversationCoordinator ? { conversationCoordinator } : {}) })
    : undefined;
  const turnResultHandler = turnRepository
    ? createTurnResultHandler({ authenticate: createVictoriaSessionAuthenticator(secret), turns: turnRepository })
    : undefined;
  const processQueuedTurnHandler = processQueuedTurn
    ? createQueuedTurnProcessHandler({ authenticate: createVictoriaSessionAuthenticator(secret), process: processQueuedTurn })
    : undefined;
  const submitTurnHandler = turnRepository
    ? createSubmitTurnHandler({
      authenticate: createVictoriaSessionAuthenticator(secret),
      // Conversation IDs are user-scoped namespaces, not globally addressable resources.
      ownsConversation: async (userId, conversationId) => Boolean(userId.trim() && conversationId.trim()),
      fingerprintRequest: async (input) => createHmac("sha256", secret)
        .update(input.userId).update("\0").update(input.conversationId).update("\0").update(input.message).digest("hex"),
      createTurnId: randomUUID,
      now: () => new Date().toISOString(),
      turns: turnRepository
    })
    : undefined;
  const finishHandler = createConversationFinishHandler({
    authenticate: createVictoriaSessionAuthenticator(secret),
    agent,
    ...(conversationCoordinator ? { conversationCoordinator } : {}),
    ...(turnRepository ? { turns: turnRepository } : {})
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
    ...(processQueuedTurn ? { processQueuedTurn } : {}),
    ...(turnResultHandler ? { turnResultHandler } : {}),
    ...(processQueuedTurnHandler ? { processQueuedTurnHandler } : {}),
    ...(submitTurnHandler ? { submitTurnHandler } : {}),
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
