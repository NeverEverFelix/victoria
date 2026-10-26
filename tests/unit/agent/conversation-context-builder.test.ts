import { describe, expect, it } from "vitest";
import { buildVictoriaConversationContext } from "../../../src/agent/conversation-context-builder.js";
import { buildTurnContext } from "../../../src/agent/turn-context.js";

describe("buildVictoriaConversationContext", () => {
  it("assembles bounded, provenance-aware facts and keeps a projection separate from the pending entry", () => {
    const priorTurns = [
      "My work now covers my $35/month gym membership. I still play basketball there.",
      "Victoria: You could plan around $35 a month or a conditional $420 annual projection."
    ];
    const turnContext = buildTurnContext({ message: "record the yearly amount", priorTurns });
    const context = buildVictoriaConversationContext({
      priorTurns,
      turnContext,
      activeWorkflow: {
        pendingRecordableAmountCents: 3_500,
        planningChoice: {
          monthlyAmountCents: 3_500,
          annualProjectionCents: 42_000,
          selectedHorizon: "annual"
        }
      }
    });

    expect(context.relevantUserTurns).toEqual([{
      sourceTurnIndex: 0,
      text: "My work now covers my $35/month gym membership. I still play basketball there."
    }]);
    expect(context.financialFacts).toEqual([
      expect.objectContaining({
        id: "turn:0:monthly-recurring-cost", amountCents: 3_500,
        period: "monthly", meaning: "user_reported_recurring_cost", provenance: "user_statement"
      }),
      expect.objectContaining({
        id: "turn:0:annual-projection", amountCents: 42_000,
        period: "annual", meaning: "conditional_projection", provenance: "derived",
        derivedFromFactId: "turn:0:monthly-recurring-cost"
      })
    ]);
    expect(context.activeSavingsWorkflow).toEqual({
      status: "awaiting_confirmation",
      pendingRecordableAmountCents: 3_500,
      selectedPlanningPeriod: "annual",
      selectedPlanningAmountCents: 42_000,
      selectedPlanningMeaning: "conditional_projection",
      integrity: "consistent"
    });
  });

  it("withholds a recordable amount when it conflicts with the planning choice", () => {
    const context = buildVictoriaConversationContext({
      priorTurns: [],
      turnContext: buildTurnContext({ message: "", priorTurns: [] }),
      activeWorkflow: {
        pendingRecordableAmountCents: 4_200,
        planningChoice: { monthlyAmountCents: 3_500, annualProjectionCents: 42_000 }
      }
    });
    expect(context.activeSavingsWorkflow).toEqual({
      status: "awaiting_confirmation",
      integrity: "amount_mismatch"
    });
  });

  it("does not pass unrelated assistant turns as financial evidence", () => {
    const priorTurns = [
      "Victoria: What would help you feel more confident about basketball?",
      "My employer covers a $35/month gym membership now.",
      "Victoria: Which planning target do you prefer?"
    ];
    const context = buildVictoriaConversationContext({
      priorTurns,
      turnContext: buildTurnContext({ message: "yearly", priorTurns })
    });
    expect(context.relevantUserTurns).toEqual([{
      sourceTurnIndex: 1,
      text: "My employer covers a $35/month gym membership now."
    }]);
  });
});
