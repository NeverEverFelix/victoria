import { describe, expect, it } from "vitest";
import { formatUsd } from "../../src/domain/money.js";
import {
  MockLlmAdapter,
  MockMemoryProvider,
  MockVictoriaTools,
  AgentTeamPrototype,
  VictoriaAgent
} from "../../src/agent/index.js";
import type {
  AgentMemory,
  AgentTeamSpecialists,
  ClassifiedMessage,
  SavingsAssessment
} from "../../src/agent/index.js";
import { multiAgentReadinessScenarios } from "./fixtures/multi-agent-scenarios.js";
import { summarizeLatencies } from "./metrics.js";

const userId = "eval_user";

describe("multi-agent readiness evaluation corpus", () => {
  it.each(multiAgentReadinessScenarios)("$id preserves the current behavior contract", async (scenario) => {
    const memory = new MockMemoryProvider(scenario.habits ?? []);
    const tools = new MockVictoriaTools(scenario.habits ?? []);
    const baseline = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });
    const baselineResponse = await baseline.respond({ userId, message: scenario.userMessage });

    const agentMemory = await memory.getMemoryForUser(userId);
    const team = new MockLlmAdapter();
    const specialists = scriptedSpecialists(team, agentMemory);
    const specialistTurn = await new AgentTeamPrototype(specialists)
      .respond({ message: scenario.userMessage, memory: agentMemory });

    expect(baselineResponse.decision.classification.type).toBe(scenario.expectedClassification);
    expect(baselineResponse.decision.action).toBe(scenario.expectedSingleAgentAction);
    expect(specialistTurn.finding.classification.type).toBe(scenario.expectedClassification);
    expect(specialistTurn.assessment.outcome).toBe(scenario.expectedSpecialistAssessment);
    expect(specialistTurn.specialistCalls).toBeLessThanOrEqual(3);
    expect(await tools.listSavingsEntries(userId)).toEqual([]);

    if (scenario.expectedAmountCents !== undefined) {
      expect(baselineResponse.decision.suggestion?.amountCents).toBe(scenario.expectedAmountCents);
      expect(specialistTurn.assessment).toMatchObject({ amountCents: scenario.expectedAmountCents });
      expect(specialistTurn.message).toContain(formatUsd(scenario.expectedAmountCents));
      expect(specialistTurn.message).toContain("Please confirm");
      expect(specialistTurn.message).toContain("No real money has moved");
    }
    if (scenario.expectedClassification === "real_money_movement_request") {
      expect(baselineResponse.message).toContain("can't move real money");
      expect(specialistTurn.message).toContain("can't move real money");
      expect(specialistTurn.message).toContain("No transfer has been made");
    }
  });

  it("collects baseline and specialist latency distributions across the corpus", async () => {
    const baselineLatencies: number[] = [];
    const specialistLatencies: number[] = [];
    for (const scenario of multiAgentReadinessScenarios) {
      const memoryProvider = new MockMemoryProvider(scenario.habits ?? []);
      const tools = new MockVictoriaTools(scenario.habits ?? []);
      const baseline = new VictoriaAgent({ llm: new MockLlmAdapter(), memory: memoryProvider, tools });
      const memory = await memoryProvider.getMemoryForUser(userId);

      const baselineStart = performance.now();
      await baseline.respond({ userId, message: scenario.userMessage });
      baselineLatencies.push(Math.max(0, performance.now() - baselineStart));

      const teamStart = performance.now();
      await new AgentTeamPrototype(scriptedSpecialists(new MockLlmAdapter(), memory))
        .respond({ message: scenario.userMessage, memory });
      specialistLatencies.push(Math.max(0, performance.now() - teamStart));
    }

    const baselineSummary = summarizeLatencies(baselineLatencies);
    const specialistSummary = summarizeLatencies(specialistLatencies);
    expect(baselineSummary.sampleCount).toBe(multiAgentReadinessScenarios.length);
    expect(specialistSummary.sampleCount).toBe(multiAgentReadinessScenarios.length);
    expect(baselineSummary.p95Ms).toBeGreaterThanOrEqual(baselineSummary.p50Ms ?? 0);
    expect(specialistSummary.p95Ms).toBeGreaterThanOrEqual(specialistSummary.p50Ms ?? 0);
  });
});

function scriptedSpecialists(llm: MockLlmAdapter, memory: AgentMemory): AgentTeamSpecialists {
  return {
    financialMoment: {
      analyze: async ({ message }) => ({
        classification: await llm.classifyMessage({ userMessage: message, memory })
      })
    },
    savingsReasoning: {
      assess: async ({ finding }) => assessDeterministically(finding.classification, memory)
    },
    companionVoice: {
      respond: async ({ assessment }) => assessment.outcome === "suggest"
        ? `Would you like me to record ${formatUsd(assessment.amountCents)}?`
        : assessment.outcome === "ask"
          ? assessment.question
          : "No shame. We can reflect and plan for next time."
    }
  };
}

function assessDeterministically(classification: ClassifiedMessage, memory: AgentMemory): SavingsAssessment {
  if (classification.type !== "avoided_spend") {
    return classification.type === "unclear"
      ? { outcome: "ask", question: "What did you avoid spending on, and about how much?" }
      : { outcome: "reflect", rationale: "This moment does not support a savings suggestion." };
  }
  if (classification.amountIssue) {
    return { outcome: "ask", question: "Which amount should I use?" };
  }
  if (classification.amountCents !== undefined) {
    return {
      outcome: "suggest", amountCents: classification.amountCents,
      source: "user_provided", rationale: "The user supplied an explicit amount."
    };
  }
  const habit = memory.habits.find((candidate) =>
    candidate.merchantName.toLowerCase() === classification.merchantName?.toLowerCase()
  );
  if (habit) {
    return {
      outcome: "suggest", amountCents: habit.typicalAmountCents,
      source: "habit_estimate", rationale: `Typical spend at ${habit.merchantName}.`
    };
  }
  return { outcome: "ask", question: "About how much would you like me to use?" };
}
