import {
  createMockAgentTeamSpecialists,
  MockLlmAdapter,
  MockMemoryProvider,
  MockVictoriaTools,
  OpenAiFinancialMomentAdapter,
  VictoriaAgent
} from "../agent/index.js";
import { buildFeatureFlags, type VictoriaEnv } from "../config/index.js";
import type { UserHabit } from "../agent/types.js";

export interface CreateVictoriaAgentOptions {
  env: VictoriaEnv;
  seedHabits?: UserHabit[];
  fetcher?: typeof fetch;
}

export function createVictoriaAgent(options: CreateVictoriaAgentOptions): VictoriaAgent {
  const flags = buildFeatureFlags(options.env);

  if (!flags.useMockLedger) {
    throw new Error("Real money movement is not wired yet. Set MONEY_MOVEMENT_MODE=mock_ledger.");
  }

  const habits = options.seedHabits ?? [];
  const classifier = flags.useProviderFinancialMoment
    ? new OpenAiFinancialMomentAdapter({
      apiKey: options.env.openAiApiKey,
      model: options.env.openAiModel,
      ...(options.fetcher ? { fetcher: options.fetcher } : {})
    })
    : new MockLlmAdapter();

  return new VictoriaAgent({
    llm: classifier,
    memory: new MockMemoryProvider(habits),
    tools: new MockVictoriaTools(habits),
    specialists: createMockAgentTeamSpecialists(classifier)
  });
}
