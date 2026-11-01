import { describe, expect, it, vi } from "vitest";
import { buildVictoriaConversationContext } from "../../../src/agent/conversation-context-builder.js";
import { ConversationTurnReplyService } from "../../../src/agent/conversation-turn-reply-service.js";
import { MockMemoryProvider } from "../../../src/agent/memory/mock-memory.js";
import { buildTurnContext } from "../../../src/agent/turn-context.js";
import { buildConversationContextSnapshot } from "../../../src/agent/conversation-responder.js";
import { ConversationTurnUnderstandingService } from "../../../src/agent/turn-understanding.js";
import type { ConversationContextSnapshot, ConversationResponderInput } from "../../../src/agent/conversation-responder.js";

describe("ConversationTurnReplyService", () => {
  it("builds a scoped reply with relevant memories and removes unrequested event history", async () => {
    const memory = new MockMemoryProvider();
    const potteryMemory = await memory.rememberConversationalMemory("reply-service-user", {
      category: "preference", key: "activity:pottery", value: "Enjoys pottery.",
      evidence: "I enjoy pottery.", confidence: 0.95, sourceType: "user_statement"
    });
    const memoryRead = vi.spyOn(memory, "getMemoryForUser");
    const financialContext = buildVictoriaConversationContext({
      priorTurns: [], message: "I'm thinking about my budget.",
      turnContext: buildTurnContext({ message: "I'm thinking about my budget.", priorTurns: [] }),
      savingsEvents: [{
        id: "event-private-to-history-question", userId: "reply-service-user", type: "avoided_spend",
        summary: "Skipped a personal purchase", classificationConfidence: 0.95,
        createdAt: "2026-10-01T00:00:00.000Z"
      }]
    });
    const contextSnapshot = buildConversationContextSnapshot({
      message: "I'm thinking about my budget.", recentTurns: [], memories: [{
        id: potteryMemory.id, key: potteryMemory.key, value: potteryMemory.value, provenance: "user_statement"
      }], episodicSummaries: [],
      financialContext,
      conversationSavingsEvents: financialContext.conversationSavingsEvents
    });
    let interpretedSnapshot: ConversationContextSnapshot | undefined;
    const modelPlan = {
      schemaVersion: 1 as const, primaryIntent: "financial_reflection" as const, secondaryIntents: [],
      dialogueActs: ["question" as const], questionFocus: "I'm thinking about my budget.", references: [],
      requestedReadOnlyTools: [], actionMention: "none" as const, requestedAction: "none" as const,
      uncertainty: { needsClarification: false, reasons: [] as string[] }
    };
    const suppliedSnapshot = Object.freeze({ ...contextSnapshot, turnUnderstanding: modelPlan });
    let responderInput: ConversationResponderInput | undefined;
    const service = new ConversationTurnReplyService(memory, {
      async respond(input) { responderInput = input; return "We can work through your budget."; }
    }, new ConversationTurnUnderstandingService({ provider: {
      async understandTurn({ contextSnapshot: snapshot }) {
        interpretedSnapshot = snapshot;
        return modelPlan;
      }
    } }));

    const response = await service.respond({
      request: { userId: "reply-service-user", conversationId: "reply-service-chat", message: "I'm thinking about my budget." },
      recentTurns: [], baselineReply: "What part would you like to consider?", financialContext,
      contextSnapshot: suppliedSnapshot
    });

    expect(response.message).toBe("We can work through your budget.");
    expect(response.decision.action).toBe("reflect");
    expect(memoryRead).not.toHaveBeenCalled();
    expect(responderInput?.memories).toEqual(expect.arrayContaining([
      expect.objectContaining({ key: "activity:pottery", value: "Enjoys pottery." })
    ]));
    expect(responderInput?.financialContext?.conversationSavingsEvents).toEqual([]);
    expect(responderInput?.contextSnapshot?.turnUnderstanding).toBeDefined();
    expect(responderInput?.contextSnapshot?.conversationSavingsEvents).toBeUndefined();
    expect(responderInput?.contextSnapshot?.financialContext?.conversationSavingsEvents).toEqual([]);
    expect(interpretedSnapshot?.conversationSavingsEvents).toBeUndefined();
    expect(interpretedSnapshot?.financialContext?.conversationSavingsEvents).toEqual([]);
    expect(JSON.stringify(interpretedSnapshot)).not.toContain("event-private-to-history-question");
    expect(JSON.stringify(responderInput)).not.toContain("Skipped a personal purchase");
  });

  it("removes an unrequested historical-event reference from the interpretation and reply snapshots", async () => {
    const memory = new MockMemoryProvider();
    const message = "Which purchase did I mention at Paper House?";
    const financialContext = buildVictoriaConversationContext({
      priorTurns: [], message,
      turnContext: buildTurnContext({ message, priorTurns: [] }),
      savingsEvents: [{
        id: "paper-house-event", userId: "history-boundary-user", type: "avoided_spend",
        summary: "I waited before buying a book from Paper House.", merchantName: "Paper House",
        classificationConfidence: 0.95, createdAt: "2026-10-01T00:00:00.000Z"
      }]
    });
    expect(financialContext.historicalEventReference?.kind).toBe("resolved");
    const contextSnapshot = buildConversationContextSnapshot({
      message, recentTurns: [], memories: [], episodicSummaries: [], financialContext,
      conversationSavingsEvents: financialContext.conversationSavingsEvents
    });
    let responderInput: ConversationResponderInput | undefined;
    const service = new ConversationTurnReplyService(memory, {
      async respond(input) { responderInput = input; return "I don't have that event available in this reply."; }
    }, new ConversationTurnUnderstandingService());

    await service.respond({
      request: { userId: "history-boundary-user", conversationId: "history-boundary-chat", message },
      recentTurns: [], baselineReply: "I don't have the event details available.", financialContext, contextSnapshot
    });

    expect(responderInput?.financialContext?.historicalEventReference).toBeUndefined();
    expect(responderInput?.financialContext?.conversationSavingsEvents).toEqual([]);
    expect(responderInput?.contextSnapshot?.references?.historicalEvent).toBeUndefined();
    expect(responderInput?.contextSnapshot?.dialogueState?.referencedEntities).not.toContainEqual({
      kind: "savings_event", id: "paper-house-event"
    });
    expect(responderInput?.contextSnapshot?.conversationSavingsEvents).toBeUndefined();
    expect(responderInput?.contextSnapshot?.financialContext?.historicalEventReference).toBeUndefined();
    expect(JSON.stringify(responderInput)).not.toContain("paper-house-event");
  });
});
