import type { ConversationWorkflowState } from "./conversation-state-manager.js";
import { buildVictoriaConversationContext } from "./conversation-context-builder.js";
import type { TurnContext } from "./turn-context.js";
import type { AgentRequest, AgentResponse } from "./types.js";
import type { ConversationSavingsEventStore } from "./savings-event-store.js";
import type { ConversationMemoryContextService } from "./conversation-memory-context-service.js";
import {
  buildConversationContextSnapshot,
  type ConversationContextSnapshot,
  type ConversationResponderInput
} from "./conversation-responder.js";
import {
  conversationResponderMemories,
  conversationResponsePreferenceInput,
  selectConversationEpisodeSummaries
} from "./conversation-turn-reply-service.js";
import { buildConversationIntentPlan } from "./conversation-intent-plan.js";
import type { ConversationTurnUnderstandingService } from "./turn-understanding.js";

/** Assembles read-only event-history context while a savings proposal stays pending. */
export class PendingSavingsHistoryResponseService {
  constructor(private readonly dependencies: {
    readonly savingsEvents: ConversationSavingsEventStore;
    readonly memoryContext: Pick<ConversationMemoryContextService, "retrieve">;
    readonly turnUnderstanding: Pick<ConversationTurnUnderstandingService, "understand">;
    readonly respondConversationalTurn: (input: {
      readonly request: AgentRequest;
      readonly recentTurns: readonly string[];
      readonly baselineReply: string;
      readonly events: NonNullable<ConversationResponderInput["conversationSavingsEvents"]>;
      readonly financialContext: NonNullable<ConversationResponderInput["financialContext"]>;
      readonly contextSnapshot: ConversationContextSnapshot;
    }) => Promise<AgentResponse>;
  }) {}

  async respond(input: {
    readonly request: AgentRequest;
    readonly recentTurns: readonly string[];
    readonly turnContext: TurnContext;
    readonly workflowState?: ConversationWorkflowState;
  }): Promise<AgentResponse> {
    const { request, recentTurns, turnContext, workflowState } = input;
    const savingsEvents = await this.dependencies.savingsEvents.list(request.userId, request.conversationId ?? "default");
    const financialContext = buildVictoriaConversationContext({
      priorTurns: recentTurns,
      turnContext,
      message: request.message,
      savingsEvents,
      ...(workflowState ? { workflowState } : {})
    });
    const historyMemory = await this.dependencies.memoryContext.retrieve(request.userId, request.message);
    const memories = historyMemory.conversationalMemories ?? [];
    const historySnapshot = buildConversationContextSnapshot({
      message: request.message,
      recentTurns,
      memories: conversationResponderMemories(memories, financialContext, request.message),
      episodicSummaries: selectConversationEpisodeSummaries(memories, request.message),
      ...conversationResponsePreferenceInput(memories),
      pendingAction: "savings_entry",
      conversationSavingsEvents: financialContext.conversationSavingsEvents,
      financialContext
    });
    const historyUnderstanding = await this.dependencies.turnUnderstanding.understand({
      contextSnapshot: historySnapshot,
      fallback: buildConversationIntentPlan({ message: request.message, recentTurns, hasPendingWorkflow: true })
    });
    const understoodSnapshot: ConversationContextSnapshot = Object.freeze({
      ...historySnapshot,
      turnUnderstanding: historyUnderstanding.plan,
      turnUnderstandingSource: historyUnderstanding.source
    });

    const historicalReference = financialContext.historicalEventReference;
    if (historicalReference?.kind === "ambiguous" || historicalReference?.kind === "not_found") {
      const message = historicalReference.kind === "ambiguous"
        ? "I found more than one matching moment in this conversation. Which merchant or detail should I use?"
        : financialContext.conversationSavingsEvents.length === 0
          ? "I don't have an avoided-spend moment recorded in this conversation yet."
          : "I couldn't match that description to an avoided-spend moment in this conversation. Which merchant or detail do you mean?";
      return { message, decision: {
        action: "reflect",
        classification: { type: "general_finance", confidence: 1, summary: request.message, needsClarification: false },
        userFacingMessage: message
      } };
    }

    return this.dependencies.respondConversationalTurn({
      request,
      recentTurns,
      baselineReply: "I can answer from the savings events in this conversation. The pending suggestion remains unchanged and has not been recorded.",
      events: financialContext.conversationSavingsEvents,
      financialContext,
      contextSnapshot: understoodSnapshot
    });
  }
}
