import { describe, expect, it } from "vitest";
import { createOpenAiAgentTeamSpecialists } from "../../../src/agent/team/openai-specialists.js";
import type { AgentMemory } from "../../../src/agent/types.js";
import type { VictoriaConversationContext } from "../../../src/agent/conversation-context-builder.js";

const memory: AgentMemory = { habits: [], goals: [], recentDecisions: [] };

describe("OpenAI Savings Reasoning context handoff", () => {
  it("sends only the curated typed financial context alongside the validated finding", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ output: [{ type: "message", content: [{
        type: "output_text",
        text: JSON.stringify({ outcome: "ask", confidence: 0.9, amountCents: null, source: null, rationale: null, question: "Which amount should I use?" })
      }] }] }), { status: 200 });
    };
    const financialContext: VictoriaConversationContext = {
      relevantUserTurns: [{ sourceTurnIndex: 0, text: "My employer covers a $35/month gym cost." }],
      selectedMemoryFacts: [],
      conversationSavingsEvents: [],
      financialFacts: [
        {
          id: "turn:0:monthly-recurring-cost", amountCents: 3_500, currency: "USD", period: "monthly",
          meaning: "user_reported_recurring_cost", provenance: "user_statement", evidenceTurnIndexes: [0]
        },
        {
          id: "turn:0:annual-projection", amountCents: 42_000, currency: "USD", period: "annual",
          meaning: "conditional_projection", provenance: "derived", evidenceTurnIndexes: [0],
          derivedFromFactId: "turn:0:monthly-recurring-cost", condition: "Only if the cost remains out of the budget for 12 months."
        }
      ],
      workflowState: {
        status: "awaiting_confirmation", actionId: "action-1", proposalId: "proposal-1", eventId: "event-1",
        pendingRecordableAmountCents: 3_500,
        sourceEvent: {
          id: "event-1", summary: "Employer covers a $35/month gym membership.",
          summaryProvenance: "validated_event_summary", merchantName: "gym", userProvidedAmountCents: 3_500
        },
        currentMessageReference: { eventId: "event-1", matchedBy: "merchant_name" },
        selectedPlanningPeriod: "annual", selectedPlanningAmountCents: 42_000,
        selectedPlanningMeaning: "conditional_projection", integrity: "consistent"
      }
    };
    const team = createOpenAiAgentTeamSpecialists({ apiKey: "test-key", model: "test-model", fetcher });
    const result = await team.savingsReasoning.assess({
      finding: { classification: {
        type: "avoided_spend", confidence: 0.9, amountCents: 2_000,
        summary: "Avoided a book purchase", needsClarification: false
      } },
      memory,
      financialContext
    });

    expect(result.outcome).toBe("ask");
    const providerInput = JSON.parse(String(requestBody?.input)) as { financialContext?: unknown };
    expect(providerInput.financialContext).toEqual(financialContext);
  });
});

describe("OpenAI Financial Moment context handoff", () => {
  it("receives the same curated evidence and workflow summary before classification", async () => {
    let requestBody: Record<string, unknown> | undefined;
    const fetcher: typeof fetch = async (_input, init) => {
      requestBody = JSON.parse(String(init?.body)) as Record<string, unknown>;
      return new Response(JSON.stringify({ output: [{ type: "message", content: [{
        type: "output_text",
        text: JSON.stringify({
          type: "proposal_revision", confidence: 0.9, merchantName: null, goalName: null,
          revisionReason: "yearly amount", referenceFactId: "turn:0:annual-projection", referencePeriod: "annual", summary: "The user refers to the yearly target.", needsClarification: false
        })
      }] }] }), { status: 200 });
    };
    const financialContext: VictoriaConversationContext = {
      relevantUserTurns: [{ sourceTurnIndex: 0, text: "My employer covers a $35/month gym cost." }],
      selectedMemoryFacts: [],
      conversationSavingsEvents: [],
      financialFacts: [{
        id: "turn:0:annual-projection", amountCents: 42_000, currency: "USD", period: "annual",
        meaning: "conditional_projection", provenance: "derived", evidenceTurnIndexes: [0],
        condition: "Only if the cost remains out of the budget for 12 months."
      }],
      workflowState: {
        status: "awaiting_confirmation", actionId: "action-1", proposalId: "proposal-1", eventId: "event-1",
        pendingRecordableAmountCents: 3_500,
        sourceEvent: {
          id: "event-1", summary: "Employer covers a $35/month gym membership.",
          summaryProvenance: "validated_event_summary", merchantName: "gym", userProvidedAmountCents: 3_500
        },
        selectedPlanningPeriod: "annual", selectedPlanningAmountCents: 42_000,
        selectedPlanningMeaning: "conditional_projection", integrity: "consistent"
      }
    };
    const team = createOpenAiAgentTeamSpecialists({ apiKey: "test-key", model: "test-model", fetcher });
    const finding = await team.financialMoment.analyze({
      message: "bruh record the yearly amount", memory, financialContext
    });

    expect(finding.classification.type).toBe("proposal_revision");
    const providerInput = JSON.parse(String(requestBody?.input)) as { financialContext?: unknown };
    expect(providerInput.financialContext).toEqual(financialContext);
  });
});
