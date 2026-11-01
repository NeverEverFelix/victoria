import { describe, expect, it, vi } from "vitest";
import { ConversationMemoryContextService } from "../../../src/agent/conversation-memory-context-service.js";
import { buildTurnContext } from "../../../src/agent/turn-context.js";
import { PendingSavingsDeclineResponseService } from "../../../src/agent/pending-savings-decline-response-service.js";
import type { MemoryProvider } from "../../../src/agent/memory/types.js";
import type { AgentDecision, AgentRequest, AgentResponse } from "../../../src/agent/types.js";

const memoryContext = new ConversationMemoryContextService({
  getMemoryForUser: async () => ({ habits: [], goals: [], recentDecisions: [], conversationalMemories: [] })
} as unknown as MemoryProvider);
const baseDecision: AgentDecision = {
  action: "ask_follow_up",
  classification: { type: "avoided_spend", confidence: 1, summary: "monthly gym cost", needsClarification: false },
  suggestion: { id: "suggestion-1", amountCents: 3500, currency: "USD", reason: "Gym covered", source: "user_provided", movementMode: "mock_ledger" },
  planningChoice: { monthlyAmountCents: 3500, annualProjectionCents: 42000 },
  userFacingMessage: "Would you like me to record the $35 this month?"
};

describe("PendingSavingsDeclineResponseService", () => {
  it("acknowledges decline before answering a separate planning question", async () => {
    const respondToFollowUp = vi.fn(async (): Promise<AgentResponse> => ({
      message: "Keeping the amount as a buffer could help with upcoming needs.",
      decision: { action: "reflect", classification: { type: "general_finance", confidence: 1, summary: "buffer", needsClarification: false }, userFacingMessage: "Keeping the amount as a buffer could help." }
    }));
    const service = new PendingSavingsDeclineResponseService({ memoryContext, respondToFollowUp });
    const request: AgentRequest = {
      userId: "user-1", conversationId: "chat-1", message: "No. What should I do about my debt?"
    };
    const turnContext = buildTurnContext({ message: request.message, priorTurns: [] });

    const result = await service.respond({
      request, recentTurns: [], turnContext, pendingDecision: baseDecision,
      proposalTransitions: []
    });

    expect(result.message).toMatch(/^No problem\. I won't record it\. /);
    expect(result.decision.action).toBe("reflect");
    expect(respondToFollowUp).toHaveBeenCalled();
    expect(result.decision.proposalTransitions).toBeUndefined();
  });

  it("answers a supported buffer question without calling the general responder", async () => {
    const respondToFollowUp = vi.fn(async (): Promise<AgentResponse> => { throw new Error("should not run"); });
    const service = new PendingSavingsDeclineResponseService({ memoryContext, respondToFollowUp });
    const request: AgentRequest = {
      userId: "user-1", conversationId: "chat-1", message: "No. Should I keep it as a buffer?"
    };

    const result = await service.respond({
      request, recentTurns: [], turnContext: buildTurnContext({ message: request.message, priorTurns: [] }),
      pendingDecision: baseDecision
    });

    expect(result.message).toContain("No problem. I won't record it.");
    expect(result.message).toContain("planning choice; nothing has been recorded");
    expect(respondToFollowUp).not.toHaveBeenCalled();
  });

  it("never carries a follow-up action or tool call back after the proposal was declined", async () => {
    const respondToFollowUp = vi.fn(async (): Promise<AgentResponse> => ({
      message: "Would you like to record $35?",
      decision: {
        action: "suggest_savings",
        classification: { type: "avoided_spend", confidence: 1, summary: "new ask", needsClarification: false },
        toolCall: { name: "createSavingsEntry", actionId: "new-action", arguments: {}, requiresApproval: true },
        userFacingMessage: "Would you like to record $35?"
      }
    }));
    const service = new PendingSavingsDeclineResponseService({ memoryContext, respondToFollowUp });
    const request: AgentRequest = {
      userId: "user-1", conversationId: "chat-1", message: "No. What about my debt?"
    };

    const result = await service.respond({
      request, recentTurns: [], turnContext: buildTurnContext({ message: request.message, priorTurns: [] }),
      pendingDecision: baseDecision
    });

    expect(result.message).toBe("No problem. I won't record it.");
    expect(result.decision.action).toBe("reflect");
    expect(result.decision.toolCall).toBeUndefined();
  });
});
