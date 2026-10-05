import { formatUsd } from "../../domain/money.js";
import { MockLlmAdapter } from "../llm/mock-llm.js";
import type { AgentMemory } from "../types.js";
import type { AgentTeamSpecialists, SavingsAssessment } from "../team-prototype.js";

/** Deterministic specialists used by the headless core product until a provider is evaluated. */
export function createMockAgentTeamSpecialists(): AgentTeamSpecialists {
  const classifier = new MockLlmAdapter();
  return {
    financialMoment: {
      async analyze({ message, memory, conversationContext }) {
        return { classification: await classifier.classifyMessage({
          userMessage: message, memory,
          ...(conversationContext ? { conversationContext } : {})
        }) };
      }
    },
    savingsReasoning: {
      async assess({ finding, memory }) {
        return assessSavings(finding.classification, memory);
      }
    },
    companionVoice: {
      async respond({ assessment }) {
        if (assessment.outcome === "ask") return assessment.question;
        if (assessment.outcome === "reflect") {
          return "No shame. Want to look at what led to it and think about a small next step?";
        }
        const amount = formatUsd(assessment.amountCents);
        const estimate = assessment.source === "habit_estimate" ? "estimated " : "";
        return `Would you like me to record the ${estimate}${amount} in your Victoria savings ledger?`;
      }
    }
  };
}

function assessSavings(
  classification: { type: string; amountCents?: number; amountIssue?: string; merchantName?: string },
  memory: AgentMemory
): SavingsAssessment {
  if (classification.type === "avoided_spend") {
    if (classification.amountIssue) return { outcome: "ask", confidence: 0.95, question: "Which single positive USD amount should I use?" };
    if (classification.amountCents !== undefined) {
      return {
        outcome: "suggest",
        confidence: 0.95,
        amountCents: classification.amountCents,
        source: "user_provided",
        rationale: "Using the exact amount the user provided."
      };
    }
    const habit = memory.habits.find((item) =>
      item.currency === "USD" &&
      item.merchantName.toLowerCase() === classification.merchantName?.toLowerCase() &&
      Number.isSafeInteger(item.typicalAmountCents) && item.typicalAmountCents > 0
    );
    if (habit) {
      return {
        outcome: "suggest",
        confidence: Math.min(0.9, habit.confidence),
        amountCents: habit.typicalAmountCents,
        source: "habit_estimate",
        rationale: `Estimated from typical spend at ${habit.merchantName}.`
      };
    }
    return { outcome: "ask", confidence: 0.95, question: "About how much would you have spent if you had gone through with it?" };
  }
  if (classification.type === "unclear") {
    return { outcome: "ask", confidence: 0.95, question: "What did you avoid or change, and about how much would it have cost?" };
  }
  return { outcome: "reflect", confidence: 0.95, rationale: "Reflect without turning regret into savings." };
}
