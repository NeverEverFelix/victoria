import { describe, expect, it, vi } from "vitest";
import { buildTurnContext } from "../../../src/agent/turn-context.js";
import { PendingSavingsReadOnlyResponseService } from "../../../src/agent/pending-savings-read-only-response-service.js";
import type { AgentDecision, AgentRequest, AgentResponse } from "../../../src/agent/types.js";

const request: AgentRequest = {
  userId: "user-1", conversationId: "chat-1", message: "Can we talk about my promotion? I'm nervous."
};
const recentTurns = ["I can record the $35 monthly savings if you confirm."];
const turnContext = buildTurnContext({ message: request.message, priorTurns: recentTurns });
const pendingDecision: AgentDecision = {
  action: "ask_follow_up",
  classification: { type: "avoided_spend", confidence: 1, summary: "gym covered", needsClarification: false },
  userFacingMessage: "Would you like me to record this?"
};
const response: AgentResponse = {
  message: "A promotion can bring mixed feelings. What feels most important to think through?",
  decision: { action: "reflect", classification: { type: "general_finance", confidence: 1, summary: "promotion", needsClarification: false }, userFacingMessage: "A promotion can bring mixed feelings." }
};

describe("PendingSavingsReadOnlyResponseService", () => {
  it("passes safe topic switches to the read-only responder while retaining pending context", async () => {
    const learn = vi.fn(async () => undefined);
    const respond = vi.fn(async () => response);
    const service = new PendingSavingsReadOnlyResponseService({
      responderEnabled: true, learnFromReadOnlyTopicTurn: learn, respond
    });

    const result = await service.resolve({
      kind: "topic_switch", request, recentTurns, turnContext,
      pendingDecision
    });

    expect(result).toEqual(response);
    expect(learn).toHaveBeenCalledExactlyOnceWith(request);
    expect(respond).toHaveBeenCalledExactlyOnceWith(
      request, recentTurns, turnContext, undefined,
      expect.stringContaining("suggestion remains pending and has not been recorded")
    );
  });

  it("keeps ambiguous confirmation deterministic when no responder is configured", async () => {
    const learn = vi.fn(async () => undefined);
    const respond = vi.fn(async () => response);
    const service = new PendingSavingsReadOnlyResponseService({
      responderEnabled: false, learnFromReadOnlyTopicTurn: learn, respond
    });

    const result = await service.resolve({
      kind: "ambiguous_confirmation", request: { ...request, message: "yes, maybe" },
      recentTurns, turnContext, pendingDecision
    });

    expect(result?.message).toContain("clear yes or no");
    expect(result?.decision.action).toBe("ask_follow_up");
    expect(learn).not.toHaveBeenCalled();
    expect(respond).not.toHaveBeenCalled();
  });

  it("does not route a financial action question through the topic-switch path", async () => {
    const service = new PendingSavingsReadOnlyResponseService({
      responderEnabled: true, learnFromReadOnlyTopicTurn: vi.fn(async () => undefined),
      respond: vi.fn(async () => response)
    });

    const result = await service.resolve({
      kind: "topic_switch", request: { ...request, message: "Can you record the savings this month?" },
      recentTurns, turnContext, pendingDecision
    });

    expect(result).toBeUndefined();
  });
});
