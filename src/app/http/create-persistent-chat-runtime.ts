import "server-only";
import { createHash, createHmac, randomUUID } from "node:crypto";
import { OpenAiEmbeddingProvider } from "../../agent/memory/openai-embedding-provider.js";
import { OpenAiConversationalMemoryExtractor } from "../../agent/memory/openai-conversational-memory-extractor.js";
import { OpenAiPersonalizedReply } from "../../agent/memory/openai-personalized-reply.js";
import { OpenAiEpisodicMemorySummarizer } from "../../agent/memory/openai-episodic-memory-summarizer.js";
import { OpenAiConversationResponder } from "../../agent/conversation-responder.js";
import { PostgresMemoryRepository } from "../../agent/memory/postgres-memory-repository.js";
import { MemoryOrchestrator } from "../../agent/memory/memory-orchestrator.js";
import { SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS } from "../../agent/memory/semantic-embedding.js";
import { parseVictoriaEnv, type EnvSource } from "../../config/env.js";
import { PostgresPendingAmountClarificationStore } from "../clarifications/postgres-pending-amount-clarification-store.js";
import { PostgresPendingGoalAllocationActionStore } from "../savings/postgres-pending-goal-allocation-store.js";
import { PostgresPendingEntryCorrectionStore } from "../savings/postgres-pending-entry-correction-store.js";
import { PostgresPendingSavingsActionStore } from "../savings/postgres-pending-savings-action-store.js";
import { PostgresMockSavingsTools } from "../savings/postgres-mock-savings-tools.js";
import { PostgresConversationSavingsEventStore } from "../savings/postgres-conversation-savings-event-store.js";
import { PostgresConversationCoordinator } from "../turns/postgres-conversation-coordinator.js";
import { createQueuedTurnProcessor } from "../turns/queued-turn-processor.js";
import { createPostgresTurnStore } from "../turns/postgres-pool.js";
import { createSupabaseBearerAuthenticator } from "../auth/supabase-bearer-auth.js";
import { createVictoriaAgent } from "../create-victoria-agent.js";
import { ProviderUsageReporter } from "../../agent/telemetry/provider-usage-reporter.js";
import { createVictoriaChatHandler } from "./victoria-chat-handler.js";
import { createRlsScopedMemoryManagement } from "./rls-scoped-memory-management.js";
import { createMemoryManagementHandlers } from "./memory-management-handler.js";
import { createConversationFinishHandler } from "./conversation-finish-handler.js";
import { createTurnResultHandler } from "./turn-result-handler.js";
import { createQueuedTurnProcessHandler } from "./queued-turn-process-handler.js";
import { createSubmitTurnHandler } from "./submit-turn-handler.js";

type ChatHandler = ReturnType<typeof createVictoriaChatHandler>;
type FinishHandler = ReturnType<typeof createConversationFinishHandler>;
type TurnResultHandler = ReturnType<typeof createTurnResultHandler>;
type MemoryHandlers = ReturnType<typeof createMemoryManagementHandlers>;
let cached: { readonly key: string; readonly runtime: {
  handler: ChatHandler; finishHandler: FinishHandler; memories: MemoryHandlers;
  processQueuedTurn: ReturnType<typeof createQueuedTurnProcessor>;
  turnResultHandler: TurnResultHandler;
  processQueuedTurnHandler: ReturnType<typeof createQueuedTurnProcessHandler>;
  submitTurnHandler: ReturnType<typeof createSubmitTurnHandler>;
} } | undefined;

/** Persistent server runtime: Supabase Auth is the sole identity issuer; PostgreSQL stores chat state. */
export function getPersistentChatRuntime(source: EnvSource = process.env, fetcher?: typeof fetch) {
  if (source.APP_ENV !== "staging" && source.APP_ENV !== "production") return null;
  try {
    const env = parseVictoriaEnv(source);
    if (env.usesRealMoneyMovement) return null;
    const personalizedRepliesEnabled = source.OPENAI_PERSONALIZED_REPLIES_ENABLED !== "false" &&
      env.openAiModel !== "mock" && Boolean(env.openAiApiKey.trim()) &&
      !/(?:local-openai|replace|example|placeholder|changeme)/i.test(env.openAiApiKey);
    const episodicSummariesEnabled = source.OPENAI_EPISODIC_SUMMARIES_ENABLED !== "false" &&
      env.openAiModel !== "mock" && Boolean(env.openAiApiKey.trim()) &&
      !/(?:local-openai|replace|example|placeholder|changeme)/i.test(env.openAiApiKey);
    const providerEnabled = env.openAiModel !== "mock" && Boolean(env.openAiApiKey.trim()) &&
      !/(?:local-openai|replace|example|placeholder|changeme)/i.test(env.openAiApiKey);
    if (!providerEnabled) return null;
    const supabaseUrl = source.SUPABASE_URL?.trim();
    const publishableKey = source.SUPABASE_PUBLISHABLE_KEY?.trim();
    if (!supabaseUrl || !publishableKey) return null;
    const key = createHash("sha256").update(env.databaseUrl).update("\0").update(env.openAiApiKey)
      .update("\0").update(env.openAiModel)
      .update("\0").update(source.OPENAI_MEMORY_EXTRACTION_ENABLED === "false" ? "memory-off" : "memory-on")
      .update("\0").update(episodicSummariesEnabled ? "episodes-on" : "episodes-off")
      .update("\0").update(personalizedRepliesEnabled ? "personalized-replies-on" : "personalized-replies-off")
      .update("\0").update(supabaseUrl).update("\0").update(publishableKey).digest("hex");
    if (cached?.key === key) return cached.runtime;

    const authenticate = createSupabaseBearerAuthenticator({ supabaseUrl, publishableKey, ...(fetcher ? { fetcher } : {}) });
    const { pool, turns } = createPostgresTurnStore(env.databaseUrl, { maxPoolSize: 2 });
    const embeddings = new OpenAiEmbeddingProvider({ apiKey: env.openAiApiKey, dimensions: SEMANTIC_MEMORY_EMBEDDING_DIMENSIONS, ...(fetcher ? { fetcher } : {}) });
    const repository = new PostgresMemoryRepository(pool, undefined, embeddings);
    const memory = new MemoryOrchestrator(repository, { financialProfiles: repository });
    const pendingAmountClarifications = new PostgresPendingAmountClarificationStore(pool);
    const pendingSavingsActions = new PostgresPendingSavingsActionStore(pool);
    const savingsEvents = new PostgresConversationSavingsEventStore(pool);
    const pendingGoalAllocationActions = new PostgresPendingGoalAllocationActionStore(pool);
    const pendingEntryCorrections = new PostgresPendingEntryCorrectionStore(pool);
    const providerUsageReporter = new ProviderUsageReporter(({ role, elapsedMs, inputTokens, outputTokens }) => {
      console.info("Victoria provider stage", { role, elapsedMs, inputTokens, outputTokens });
    });
    const agent = createVictoriaAgent({
      env: { ...env, openAiAgentTeamEnabled: true }, memory, tools: new PostgresMockSavingsTools(pool), pendingAmountClarifications,
      savingsEvents,
      pendingSavingsActions, pendingGoalAllocationActions, pendingEntryCorrections, idFactory: randomUUID,
      providerUsageReporter,
      ...(source.OPENAI_MEMORY_EXTRACTION_ENABLED !== "false" ? {
        conversationalMemoryExtractor: new OpenAiConversationalMemoryExtractor({
          apiKey: env.openAiApiKey, model: env.openAiModel, ...(fetcher ? { fetcher } : {})
        })
      } : {}),
      ...(source.OPENAI_MEMORY_EXTRACTION_ENABLED !== "false" ? {
        onConversationalMemoryExtractionFailure: (errorName: string) => {
          console.warn("Victoria conversational memory extraction failed; continuing without provider-derived memories.", { errorName });
        }
      } : {}),
      onCompanionVoiceValidationFailure: (issues) => {
        console.warn("Victoria companion voice draft remained invalid after revision; using guarded fallback.", { issues });
      },
      onFinancialMomentFallback: (source) => {
        console.warn("Victoria financial interpretation used deterministic recovery.", { source });
      },
      onConversationReplyFallback: (reason) => {
        console.warn("Victoria conversation reply used deterministic recovery.", { schemaVersion: 1, reason });
      },
      onConversationTurnTrace: (trace) => {
        console.info("Victoria turn trace", trace);
      },
      ...(episodicSummariesEnabled ? {
        episodicMemorySummarizer: new OpenAiEpisodicMemorySummarizer({
          apiKey: env.openAiApiKey, model: env.openAiModel, ...(fetcher ? { fetcher } : {})
        })
      } : {}),
      ...(personalizedRepliesEnabled ? {
        personalizedReplyPersonalizer: new OpenAiPersonalizedReply({
          apiKey: env.openAiApiKey, model: env.openAiModel, ...(fetcher ? { fetcher } : {})
        })
      } : {}),
      conversationResponder: new OpenAiConversationResponder({
        apiKey: env.openAiApiKey, model: env.openAiModel, usageReporter: providerUsageReporter,
        ...(fetcher ? { fetcher } : {})
      }),
      ...(fetcher ? { fetcher } : {})
    });
    const conversationCoordinator = new PostgresConversationCoordinator(pool);
    const processQueuedTurn = createQueuedTurnProcessor({ turns, agent, conversationCoordinator });
    const turnResultHandler = createTurnResultHandler({ authenticate, turns });
    const processQueuedTurnHandler = createQueuedTurnProcessHandler({ authenticate, process: processQueuedTurn });
    const submitTurnHandler = createSubmitTurnHandler({
      authenticate,
      // Conversation IDs are user-scoped namespaces, not globally addressable resources.
      ownsConversation: async (userId, conversationId) => Boolean(userId.trim() && conversationId.trim()),
      fingerprintRequest: async (input) => createHmac("sha256", env.databaseUrl)
        .update(input.userId).update("\0").update(input.conversationId).update("\0").update(input.message).digest("hex"),
      createTurnId: randomUUID,
      now: () => new Date().toISOString(),
      turns
    });
    const handler = createVictoriaChatHandler({
      authenticate, agent, conversationCoordinator, turns
    });
    const finishHandler = createConversationFinishHandler({ authenticate, agent, conversationCoordinator, turns });
    const memoryForUser = createRlsScopedMemoryManagement(pool, embeddings);
    const memories = createMemoryManagementHandlers({ authenticate, memoryForUser });
    const runtime = Object.freeze({ handler, finishHandler, memories, processQueuedTurn, turnResultHandler, processQueuedTurnHandler, submitTurnHandler });
    cached = Object.freeze({ key, runtime });
    return runtime;
  } catch {
    return null;
  }
}
