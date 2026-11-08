import { describe, expect, it } from "vitest";
import { composeTeamDecisionMessage, type TeamAdvice } from "../../../src/agent/response-composition.js";
import type { AgentDecision, ClassifiedMessage } from "../../../src/agent/types.js";

function decision(type: ClassifiedMessage["type"], action: AgentDecision["action"], amountCents?: number): AgentDecision {
  return {
    action,
    classification: { type, confidence: 1, summary: "test", needsClarification: false },
    ...(amountCents === undefined ? {} : { suggestion: {
      id: "suggestion-1", amountCents, currency: "USD" as const, reason: "test",
      source: "user_provided" as const, movementMode: "mock_ledger" as const
    } }),
    userFacingMessage: "Validated baseline"
  };
}

describe("composeTeamDecisionMessage", () => {
  it("uses specialist clarification and reflection only for matching decision types", () => {
    const askAdvice: TeamAdvice = { assessment: { outcome: "ask", confidence: 1, question: "Which cost?" }, message: "Which cost?" };
    const reflectionAdvice: TeamAdvice = { assessment: { outcome: "reflect", confidence: 1, rationale: "Reflect" }, message: "That sounds hard." };

    expect(composeTeamDecisionMessage(decision("unclear", "ask_follow_up"), askAdvice)).toBe("Which cost?");
    expect(composeTeamDecisionMessage(decision("regretful_spend", "reflect"), reflectionAdvice)).toBe("That sounds hard.");
    expect(composeTeamDecisionMessage(decision("general_finance", "reflect"), reflectionAdvice)).toBe("Validated baseline");
  });

  it("uses avoided-spend advice only when the suggested amount matches", () => {
    const advice: TeamAdvice = { assessment: {
      outcome: "suggest", confidence: 1, amountCents: 2_000, source: "user_provided", rationale: "Stated"
    }, message: "Would you like to record $20?" };

    expect(composeTeamDecisionMessage(decision("avoided_spend", "suggest_savings", 2_000), advice))
      .toBe("Would you like to record $20?");
    expect(composeTeamDecisionMessage(decision("avoided_spend", "suggest_savings", 3_000), advice))
      .toBe("Validated baseline");
  });

  it("keeps the validated baseline when advice does not match the financial decision", () => {
    const advice: TeamAdvice = { assessment: { outcome: "reflect", confidence: 1, rationale: "Reflect" }, message: "Specialist text" };
    expect(composeTeamDecisionMessage(decision("avoided_spend", "ask_follow_up"), advice)).toBe("Validated baseline");
    expect(composeTeamDecisionMessage(decision("general_finance", "reflect"))).toBe("Validated baseline");
  });
});
