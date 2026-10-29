import { describe, expect, it } from "vitest";
import {
  getAllocationTargetChoiceFromConversation,
  isAnswerToRecentVictoriaQuestion,
  isCoveredAllocationTargetChoice,
  recoverPendingPlanningHorizon,
  resolveCoveredSpendPeriodAnswer
} from "../../../src/agent/conversation-dialogue-policy.js";
import type { AgentDecision, ClassifiedMessage } from "../../../src/agent/types.js";

const dialogue = [
  "I canceled a $35/month gym membership.",
  "Victoria: Which planning target would you prefer, monthly or annual?"
];

function classification(type: ClassifiedMessage["type"]): ClassifiedMessage {
  return { type, confidence: 0.9, summary: "period choice", needsClarification: false };
}

describe("conversation dialogue policy", () => {
  it("resolves short horizon answers only after the relevant planning question", () => {
    expect(isCoveredAllocationTargetChoice("annual", dialogue)).toBe(true);
    expect(isCoveredAllocationTargetChoice("annual $500", dialogue)).toBe(false);
    expect(isCoveredAllocationTargetChoice("annual", [dialogue[0]!])).toBe(false);
    expect(getAllocationTargetChoiceFromConversation([...dialogue, "annual"]))
      .toEqual({ horizon: "annual", evidence: "annual" });
  });

  it("resolves a planning-period answer without overriding real-transfer intent", () => {
    expect(resolveCoveredSpendPeriodAnswer(classification("avoided_spend"), "annual", [...dialogue, "annual"]))
      .toMatchObject({ type: "general_finance", needsClarification: false });
    const transfer = classification("real_money_movement_request");
    expect(resolveCoveredSpendPeriodAnswer(transfer, "annual", [...dialogue, "annual"])).toBe(transfer);
  });

  it("recovers a selected horizon only from a unique pending event and later prompted choice", () => {
    const summary = "I canceled a $35/month gym membership.";
    const decision: AgentDecision = {
      action: "ask_follow_up",
      classification: classification("avoided_spend"),
      planningChoice: { monthlyAmountCents: 3500, annualProjectionCents: 42000 },
      savingsEvent: {
        id: "event-1", userId: "user-1", type: "avoided_spend", summary,
        classificationConfidence: 0.95, createdAt: "2026-10-28T12:00:00.000Z"
      },
      userFacingMessage: "Which planning target do you prefer, monthly or annual?"
    };
    const history = [summary, "Victoria: Which planning target would you prefer, monthly or annual?", "annual"];

    expect(recoverPendingPlanningHorizon(decision, history).planningChoice?.selectedHorizon).toBe("annual");
    expect(recoverPendingPlanningHorizon(decision, [...history, summary])).toBe(decision);
    expect(recoverPendingPlanningHorizon({
      ...decision, planningChoice: { ...decision.planningChoice!, selectedHorizon: "monthly" }
    }, history).planningChoice?.selectedHorizon).toBe("monthly");
  });

  it("detects whether the latest dialogue turn is Victoria asking a question", () => {
    expect(isAnswerToRecentVictoriaQuestion([...dialogue, "annual"])).toBe(false);
    expect(isAnswerToRecentVictoriaQuestion(dialogue)).toBe(true);
    expect(isAnswerToRecentVictoriaQuestion(["User: Would monthly work?"])).toBe(false);
  });
});
