import {
  MockLlmAdapter,
  MockFinancialMomentSpecialist,
  MockMemoryProvider,
  MockSavingsReasoningSpecialist,
  MockCompanionVoiceSpecialist,
  MockVictoriaTools,
  VictoriaAgent
} from "../agent/index.js";
import { buildFeatureFlags, type VictoriaEnv } from "../config/index.js";
import type { UserHabit } from "../agent/types.js";

export interface CreateVictoriaAgentOptions {
  env: VictoriaEnv;
  seedHabits?: UserHabit[];
}

export function createVictoriaAgent(options: CreateVictoriaAgentOptions): VictoriaAgent {
  const flags = buildFeatureFlags(options.env);

  if (!flags.useMockAi) {
    throw new Error("Real AI adapter is not wired yet. Set OPENAI_MODEL=mock for this skeleton.");
  }

  if (!flags.useMockLedger) {
    throw new Error("Real money movement is not wired yet. Set MONEY_MOVEMENT_MODE=mock_ledger.");
  }

  const habits = options.seedHabits ?? [];
  const llm = new MockLlmAdapter();
  const memory = new MockMemoryProvider(habits);
  const tools = new MockVictoriaTools(habits);

  return new VictoriaAgent({
    memory,
    tools,
    specialists: {
      moment: new MockFinancialMomentSpecialist(llm),
      savings: new MockSavingsReasoningSpecialist()
    },
    voice: new MockCompanionVoiceSpecialist()
  });
}
