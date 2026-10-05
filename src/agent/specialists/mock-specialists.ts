import type { LlmAdapter } from "../llm/types.js";
import type {
  FinancialMomentSpecialist,
  SavingsReasoningSpecialist
} from "./coordinator.js";
import { HANDOFF_SCHEMA_VERSION } from "./handoff-schemas.js";

export class MockFinancialMomentSpecialist implements FinancialMomentSpecialist {
  constructor(private readonly llm: LlmAdapter) {}

  async analyze(input: Parameters<FinancialMomentSpecialist["analyze"]>[0]) {
    input.signal.throwIfAborted();
    const classification = await this.llm.classifyMessage({
      userMessage: input.handoff.userMessage,
      signal: input.signal
    });
    return { schemaVersion: HANDOFF_SCHEMA_VERSION, classification };
  }
}

export class MockSavingsReasoningSpecialist implements SavingsReasoningSpecialist {
  async recommend(input: Parameters<SavingsReasoningSpecialist["recommend"]>[0]) {
    input.signal.throwIfAborted();
    return {
      schemaVersion: HANDOFF_SCHEMA_VERSION,
      recommendation: { kind: "no_suggestion" as const }
    };
  }
}
