import {
  createMockAgentTeamSpecialists,
  MemoryOrchestrator,
  MockLlmAdapter,
  MockMemoryProvider,
  MockVictoriaTools,
  OpenAiFinancialMomentAdapter,
  VictoriaAgent
} from "../agent/index.js";
import { createOpenAiAgentTeamSpecialists } from "../agent/team/openai-specialists.js";
import { OpenAiContextReferenceResolver } from "../agent/context-reference-resolver.js";
import type { ConversationReplyFallbackReason, ConversationResponder } from "../agent/conversation-responder.js";
import type { ConversationTurnTrace } from "../agent/victoria-agent.js";
import type { ProviderUsageReporter } from "../agent/telemetry/provider-usage-reporter.js";
import { buildFeatureFlags, type VictoriaEnv } from "../config/index.js";
import type { UserHabit } from "../agent/types.js";
import type { MemoryProvider } from "../agent/memory/types.js";
import type { ConversationalMemoryExtractor } from "../agent/memory/conversational-memory-extractor.js";
import type { EpisodicMemorySummarizer } from "../agent/memory/episodic-summary.js";
import type { VictoriaTools } from "../agent/tools/contracts.js";
import type { PendingAmountClarificationStore } from "../agent/pending-amount-clarification-store.js";
import type { PendingSavingsActionStore } from "../agent/pending-savings-action-store.js";
import type { PendingGoalAllocationActionStore } from "../agent/pending-goal-allocation-store.js";
import type { PendingEntryCorrectionStore } from "../agent/pending-entry-correction-store.js";
import type { ConversationSavingsEventStore } from "../agent/savings-event-store.js";
import type { VoiceDraftIssue } from "../agent/team-response-policy.js";

export interface CreateVictoriaAgentOptions {
  env: VictoriaEnv;
  seedHabits?: UserHabit[];
  fetcher?: typeof fetch;
  memory?: MemoryProvider;
  conversationalMemoryExtractor?: ConversationalMemoryExtractor;
  conversationResponder?: ConversationResponder;
  episodicMemorySummarizer?: EpisodicMemorySummarizer;
  tools?: VictoriaTools;
  providerUsageReporter?: ProviderUsageReporter;
  onCompanionVoiceValidationFailure?: (issues: readonly VoiceDraftIssue[]) => void;
  onFinancialMomentFallback?: (source: "classifier" | "specialist") => void;
  onConversationReplyFallback?: (reason: ConversationReplyFallbackReason) => void;
  onConversationTurnTrace?: (trace: ConversationTurnTrace) => void;
  pendingAmountClarifications?: PendingAmountClarificationStore;
  pendingSavingsActions?: PendingSavingsActionStore;
  pendingGoalAllocationActions?: PendingGoalAllocationActionStore;
  pendingEntryCorrections?: PendingEntryCorrectionStore;
  savingsEvents?: ConversationSavingsEventStore;
  idFactory?: () => string;
}

export function createVictoriaAgent(options: CreateVictoriaAgentOptions): VictoriaAgent {
  const flags = buildFeatureFlags(options.env);

  if (!flags.useMockLedger) {
    throw new Error("Real money movement is not wired yet. Set MONEY_MOVEMENT_MODE=mock_ledger.");
  }

  const habits = options.seedHabits ?? [];
  const suppliedMemory = options.memory ?? new MockMemoryProvider(habits);
  const memory = suppliedMemory instanceof MemoryOrchestrator ? suppliedMemory : new MemoryOrchestrator(suppliedMemory);
  const tools = options.tools ?? new MockVictoriaTools(habits);
  const classifier = flags.useProviderFinancialMoment
    ? new OpenAiFinancialMomentAdapter({
      apiKey: options.env.openAiApiKey,
      model: options.env.openAiModel,
      ...(options.providerUsageReporter ? { usageReporter: options.providerUsageReporter } : {}),
      ...(options.fetcher ? { fetcher: options.fetcher } : {})
    })
    : new MockLlmAdapter();
  const specialists = flags.useProviderAgentTeam
    ? createOpenAiAgentTeamSpecialists({
      apiKey: options.env.openAiApiKey,
      model: options.env.openAiModel,
      ...(options.providerUsageReporter ? { usageReporter: options.providerUsageReporter } : {}),
      ...(options.fetcher ? { fetcher: options.fetcher } : {})
    })
    : createMockAgentTeamSpecialists(classifier);

  return new VictoriaAgent({
    llm: classifier,
    memory,
    tools,
    ...(options.conversationalMemoryExtractor ? { conversationalMemoryExtractor: options.conversationalMemoryExtractor } : {}),
    ...(options.conversationResponder ? { conversationResponder: options.conversationResponder } : {}),
    ...(options.episodicMemorySummarizer ? { episodicMemorySummarizer: options.episodicMemorySummarizer } : {}),
    specialists,
    ...(flags.useProviderAgentTeam ? { contextReferenceResolver: new OpenAiContextReferenceResolver({
      apiKey: options.env.openAiApiKey,
      model: options.env.openAiModel,
      ...(options.fetcher ? { fetcher: options.fetcher } : {})
    }) } : {}),
    ...(options.onCompanionVoiceValidationFailure
      ? { onCompanionVoiceValidationFailure: options.onCompanionVoiceValidationFailure }
      : {}),
    ...(options.onFinancialMomentFallback ? { onFinancialMomentFallback: options.onFinancialMomentFallback } : {}),
    ...(options.onConversationReplyFallback ? { onConversationReplyFallback: options.onConversationReplyFallback } : {}),
    ...(options.onConversationTurnTrace ? { onConversationTurnTrace: options.onConversationTurnTrace } : {}),
    ...(options.pendingAmountClarifications ? { pendingAmountClarifications: options.pendingAmountClarifications } : {}),
    ...(options.pendingSavingsActions ? { pendingSavingsActions: options.pendingSavingsActions } : {}),
    ...(options.pendingGoalAllocationActions ? { pendingGoalAllocationActions: options.pendingGoalAllocationActions } : {}),
    ...(options.pendingEntryCorrections ? { pendingEntryCorrections: options.pendingEntryCorrections } : {}),
    ...(options.savingsEvents ? { savingsEvents: options.savingsEvents } : {}),
    ...(options.idFactory ? { idFactory: options.idFactory } : {})
  });
}
