import type { AgentDecision, AgentRequest, AgentResponse } from "./types.js";
import type { ConversationMessage } from "./memory/types.js";
import type { ConversationSavingsEventStore } from "./savings-event-store.js";
import type { ConversationTranscriptService } from "./conversation-transcript-service.js";
import type { PendingWorkflowPersistenceService } from "./pending-workflow-persistence-service.js";

/** Persists the completed assistant turn and its auxiliary conversation event. */
export class ConversationTurnCompletionService {
  constructor(
    private readonly transcript: ConversationTranscriptService,
    private readonly savingsEvents: ConversationSavingsEventStore
  ) {}

  async recordSavingsEvent(response: AgentResponse, conversationId: string): Promise<boolean> {
    if (!response.decision.savingsEvent) return true;
    try {
      await this.savingsEvents.record({ conversationId, event: response.decision.savingsEvent });
    } catch (error) {
      if (!isCompletedFinancialMutation(response.decision)) throw error;
      // The mock-ledger action is committed. Retry this idempotent history write
      // once, but do not lose the acknowledgement if storage remains unavailable.
      try {
        await this.savingsEvents.record({ conversationId, event: response.decision.savingsEvent });
      } catch {
        return false;
      }
    }
    return true;
  }

  async persistWorkflowState(input: {
    readonly persistence: PendingWorkflowPersistenceService;
    readonly request: AgentRequest;
    readonly response: AgentResponse;
    readonly priorGoalActionId?: string;
    readonly priorGoalDecision?: AgentDecision;
    readonly priorCorrectionActionId?: string;
    readonly priorCorrectionDecision?: AgentDecision;
  }): Promise<boolean> {
    const committed = isCompletedFinancialMutation(input.response.decision);
    let persisted = true;
    const writes = [
      () => input.persistence.persistSavings(input.request, input.response.decision),
      () => input.persistence.persistGoalAllocation(input.request, input.response.decision,
        input.priorGoalActionId, input.priorGoalDecision),
      () => input.persistence.persistEntryCorrection(input.request, input.response.decision,
        input.priorCorrectionActionId, input.priorCorrectionDecision)
    ];
    for (const write of writes) {
      try {
        await write();
      } catch (error) {
        if (!committed) throw error;
        // A completed domain mutation is idempotent. Preserve its acknowledgement,
        // try the other workflow stores, and expose this auxiliary failure in trace.
        persisted = false;
      }
    }
    return persisted;
  }

  async persistAssistantTranscript(input: {
    readonly userId: string;
    readonly conversationId: string;
    readonly messages: readonly ConversationMessage[];
    readonly response: AgentResponse;
  }): Promise<boolean> {
    const completedMessages = this.transcript.appendAssistantTurn({
      conversationId: input.conversationId,
      messages: input.messages,
      response: input.response.message
    });
    let assistantTranscriptPersisted = true;
    try {
      await this.transcript.persist(input.userId, input.conversationId, completedMessages);
    } catch (error) {
      if (!isCompletedFinancialMutation(input.response.decision)) throw error;
      assistantTranscriptPersisted = false;
    }
    return assistantTranscriptPersisted;
  }
}

function isCompletedFinancialMutation(decision: AgentDecision): boolean {
  if (decision.action === "create_ledger_entry") return decision.proposal?.status === "recorded";
  if (decision.action === "record_goal_allocation") return decision.goalAllocation?.status === "recorded";
  if (decision.action === "correct_ledger_entry") {
    return decision.entryCorrection !== undefined && !("status" in decision.entryCorrection);
  }
  return false;
}
