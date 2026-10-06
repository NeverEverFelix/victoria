import {
  createMockAgentTeamSpecialists,
  MockLlmAdapter,
  MockMemoryProvider,
  MockVictoriaTools,
  createOpenAiAgentTeamSpecialists,
  OpenAiFinancialMomentAdapter,
  VictoriaAgent
} from "../agent/index.js";
import { buildFeatureFlags, type VictoriaEnv } from "../config/index.js";
import type { UserHabit } from "../agent/types.js";
import type { MemoryProvider } from "../agent/memory/types.js";
import type { VictoriaTools } from "../agent/tools/contracts.js";

export interface CreateVictoriaAgentOptions {
  env: VictoriaEnv;
  seedHabits?: UserHabit[];
  fetcher?: typeof fetch;
  memory?: MemoryProvider;
  tools?: VictoriaTools;
}

export function createVictoriaAgent(options: CreateVictoriaAgentOptions): VictoriaAgent {
  const flags = buildFeatureFlags(options.env);

  if (!flags.useMockLedger) {
    throw new Error("Real money movement is not wired yet. Set MONEY_MOVEMENT_MODE=mock_ledger.");
  }

  const habits = options.seedHabits ?? [];
  const memory = options.memory ?? new MockMemoryProvider(habits);
  const tools = options.tools ?? new MockVictoriaTools(habits);
  const classifier = flags.useProviderFinancialMoment
    ? new OpenAiFinancialMomentAdapter({
      apiKey: options.env.openAiApiKey,
      model: options.env.openAiModel,
      ...(options.fetcher ? { fetcher: options.fetcher } : {})
    })
    : new MockLlmAdapter();
  const specialists = flags.useProviderAgentTeam
    ? createOpenAiAgentTeamSpecialists({
      apiKey: options.env.openAiApiKey,
      model: options.env.openAiModel,
      ...(options.fetcher ? { fetcher: options.fetcher } : {})
    })
    : createMockAgentTeamSpecialists(classifier);

  return new VictoriaAgent({
    llm: classifier,
    memory,
    tools,
    specialists
  });
}
