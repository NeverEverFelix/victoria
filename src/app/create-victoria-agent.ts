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

export interface CreateVictoriaAgentOptions {
  env: VictoriaEnv;
  seedHabits?: UserHabit[];
  fetcher?: typeof fetch;
  memory?: MemoryProvider;
  conversationalMemoryExtractor?: ConversationalMemoryExtractor;
  episodicMemorySummarizer?: EpisodicMemorySummarizer;
  tools?: VictoriaTools;
  providerUsageReporter?: ProviderUsageReporter;
  pendingAmountClarifications?: PendingAmountClarificationStore;
  pendingSavingsActions?: PendingSavingsActionStore;
  pendingGoalAllocationActions?: PendingGoalAllocationActionStore;
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
    ...(options.episodicMemorySummarizer ? { episodicMemorySummarizer: options.episodicMemorySummarizer } : {}),
    specialists,
    ...(options.pendingAmountClarifications ? { pendingAmountClarifications: options.pendingAmountClarifications } : {}),
    ...(options.pendingSavingsActions ? { pendingSavingsActions: options.pendingSavingsActions } : {}),
    ...(options.pendingGoalAllocationActions ? { pendingGoalAllocationActions: options.pendingGoalAllocationActions } : {}),
    ...(options.idFactory ? { idFactory: options.idFactory } : {})
  });
}
