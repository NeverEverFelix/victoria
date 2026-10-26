import { describe, expect, it } from "vitest";
import { buildVictoriaConversationContext } from "../../../src/agent/conversation-context-builder.js";
import type { ActiveSavingsConversationState } from "../../../src/agent/conversation-state-manager.js";
import { buildTurnContext } from "../../../src/agent/turn-context.js";

function activeWorkflow(overrides: Partial<ActiveSavingsConversationState> = {}): ActiveSavingsConversationState {
  return {
    actionId: "action-1", proposalId: "proposal-1", eventId: "event-1", status: "awaiting_confirmation",
    pendingRecordableAmountCents: 3_500,
    sourceEvent: {
      id: "event-1", summary: "Employer covers a $35/month gym membership.",
      summaryProvenance: "validated_event_summary", merchantName: "gym", userProvidedAmountCents: 3_500
    },
    ...overrides
  };
}

describe("buildVictoriaConversationContext", () => {
  it("includes a bounded set of selected, explicitly sourced memories as context, not financial facts", () => {
    const context = buildVictoriaConversationContext({
      priorTurns: [],
      turnContext: buildTurnContext({ message: "gym membership", priorTurns: [] }),
      selectedMemories: [
        {
          id: "memory-1", category: "habit", key: "gym_routine", value: "I go to the gym weekly.",
          evidence: "I go to the gym weekly.", confidence: 0.95, createdAt: "2026-10-20T00:00:00.000Z",
          sourceType: "user_statement"
        },
        {
          id: "memory-profile", category: "financial_pattern", key: "financial_profile:merchant:gym",
          value: "Profile estimate", evidence: "Imported activity", confidence: 0.9,
          createdAt: "2026-10-20T00:00:00.000Z", sourceType: "plaid_transaction_profile"
        },
        {
          id: "memory-inactive", category: "other", key: "interest:gym", value: "Enjoys gym workouts.",
          evidence: "I enjoy gym workouts.", confidence: 0.95, createdAt: "2026-10-20T00:00:00.000Z",
          sourceType: "user_statement", sourceMetadata: { interestStatus: "inactive" }
        }
      ]
    });

    expect(context.selectedMemoryFacts).toEqual([{
      id: "memory-1", category: "habit", key: "gym_routine", value: "I go to the gym weekly.",
      evidence: "I go to the gym weekly.", provenance: "user_statement"
    }]);
    expect(context.financialFacts).toEqual([]);
  });

  it("passes only a bounded, provenance-labeled projection of authoritative conversation events", () => {
    const events = Array.from({ length: 10 }, (_, index) => ({
      id: `event-${index}`, userId: "user-1", type: "avoided_spend" as const,
      summary: `Skipped takeout ${index}`, merchantName: "Takeout", userProvidedAmountCents: 1200,
      classificationConfidence: 0.9, createdAt: `2026-10-${String(index + 1).padStart(2, "0")}T00:00:00.000Z`
    }));
    const context = buildVictoriaConversationContext({
      priorTurns: [], turnContext: buildTurnContext({ message: "that event", priorTurns: [] }), savingsEvents: events
    });
    expect(context.conversationSavingsEvents).toHaveLength(8);
    expect(context.conversationSavingsEvents[0]).toMatchObject({
      eventId: "event-2", summary: "Skipped takeout 2", userProvidedAmountCents: 1200,
      provenance: "user_reported_event"
    });
    expect(context.conversationSavingsEvents[0]).not.toHaveProperty("userId");
    expect(context.conversationSavingsEvents).not.toHaveProperty("approval");
  });

  it("assembles bounded, provenance-aware facts and keeps a projection separate from the pending entry", () => {
    const priorTurns = [
      "My work now covers my $35/month gym membership. I still play basketball there.",
      "Victoria: You could plan around $35 a month or a conditional $420 annual projection."
    ];
    const turnContext = buildTurnContext({ message: "record the yearly amount", priorTurns });
    const context = buildVictoriaConversationContext({
      priorTurns,
      turnContext,
      workflowState: activeWorkflow({
        planningChoice: {
          monthlyAmountCents: 3_500,
          annualProjectionCents: 42_000,
          selectedPeriod: "annual", selectedAmountCents: 42_000, targetType: "conditional_projection"
        }
      })
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
    expect(context.workflowState).toMatchObject({
      status: "awaiting_confirmation",
      actionId: "action-1", proposalId: "proposal-1", eventId: "event-1",
      pendingRecordableAmountCents: 3_500,
      selectedPlanningPeriod: "annual",
      selectedPlanningAmountCents: 42_000,
      selectedPlanningMeaning: "conditional_projection",
      integrity: "consistent"
    });
    expect(context.selectedMemoryFacts).toEqual([]);
  });

  it("withholds a recordable amount when it conflicts with the planning choice", () => {
    const context = buildVictoriaConversationContext({
      priorTurns: [],
      turnContext: buildTurnContext({ message: "", priorTurns: [] }),
      workflowState: activeWorkflow({
        pendingRecordableAmountCents: 4_200,
        planningChoice: { monthlyAmountCents: 3_500, annualProjectionCents: 42_000 }
      })
    });
    expect(context.workflowState).toMatchObject({
      status: "awaiting_confirmation",
      pendingRecordableAmountCents: 4_200,
      integrity: "amount_mismatch"
    });
    expect(context.selectedMemoryFacts).toEqual([]);
  });

  it("passes the structured missing-amount workflow state to specialists without adding an amount", () => {
    const context = buildVictoriaConversationContext({
      priorTurns: ["I skipped my gym membership this month."],
      turnContext: buildTurnContext({ message: "about how much?", priorTurns: [] }),
      workflowState: {
        status: "awaiting_amount", eventId: "event-amount-1", missingInformation: "amount",
        sourceEvent: {
          id: "event-amount-1", summary: "I skipped my gym membership this month.",
          summaryProvenance: "validated_event_summary", merchantName: "gym"
        }
      }
    });

    expect(context.workflowState).toEqual({
      status: "awaiting_amount", eventId: "event-amount-1", missingInformation: "amount",
      sourceEvent: {
        id: "event-amount-1", summary: "I skipped my gym membership this month.",
        summaryProvenance: "validated_event_summary", merchantName: "gym"
      }
    });
    expect(context.financialFacts).toEqual([]);
  });

  it("retains the linked pending source event when recent dialogue no longer contains the original turn", () => {
    const priorTurns = ["Victoria: How has your week been?", "I went hiking on Saturday."];
    const context = buildVictoriaConversationContext({
      priorTurns,
      message: "Please record that gym membership amount.",
      turnContext: buildTurnContext({ message: "Please record that gym membership amount.", priorTurns }),
      workflowState: activeWorkflow({ planningChoice: {
        monthlyAmountCents: 3_500, annualProjectionCents: 42_000,
        selectedPeriod: "annual", selectedAmountCents: 42_000, targetType: "conditional_projection"
      } })
    });

    expect(context.relevantUserTurns).toEqual([]);
    expect(context.workflowState).toMatchObject({
      status: "awaiting_confirmation", pendingRecordableAmountCents: 3_500,
      sourceEvent: {
        id: "event-1", summary: "Employer covers a $35/month gym membership.",
        summaryProvenance: "validated_event_summary", merchantName: "gym", userProvidedAmountCents: 3_500
      },
      currentMessageReference: { eventId: "event-1", matchedBy: "merchant_name" },
      selectedPlanningPeriod: "annual", selectedPlanningAmountCents: 42_000
    });
  });

  it("attaches an explicit revision phrase only to the active proposal identity", () => {
    const message = "Actually, make that $75 instead.";
    const context = buildVictoriaConversationContext({
      priorTurns: [],
      message,
      turnContext: buildTurnContext({ message, priorTurns: [] }),
      workflowState: activeWorkflow({
        sourceEvent: {
          id: "event-1", summary: "I waited on a gym membership.",
          summaryProvenance: "validated_event_summary", merchantName: "gym", userProvidedAmountCents: 3_500
        }
      })
    });

    expect(context.workflowState?.status === "awaiting_confirmation" && context.workflowState.currentMessageProposalReference).toEqual({
      actionId: "action-1", proposalId: "proposal-1", eventId: "event-1", matchedBy: "proposal_language"
    });

    const unrelated = "I changed my mind.";
    const unrelatedContext = buildVictoriaConversationContext({
      priorTurns: [],
      message: unrelated,
      turnContext: buildTurnContext({ message: unrelated, priorTurns: [] }),
      workflowState: activeWorkflow({
        sourceEvent: {
          id: "event-1", summary: "I waited on a gym membership.",
          summaryProvenance: "validated_event_summary", merchantName: "gym"
        }
      })
    });
    expect(unrelatedContext.workflowState?.status === "awaiting_confirmation" && unrelatedContext.workflowState.currentMessageProposalReference).toBeUndefined();
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
    expect(context.selectedMemoryFacts).toEqual([]);
  });
});
