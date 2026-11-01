import { formatUsd } from "../domain/money.js";
import type { AgentDecision, AgentRequest, AgentResponse } from "./types.js";
import { resolvePendingWorkflowMessage } from "./pending-workflow-policy.js";
import { PendingEntryCorrectionService } from "./pending-entry-correction-service.js";
import { PendingGoalAllocationService } from "./pending-goal-allocation-service.js";

export interface PendingWorkflowResponseCallbacks {
  readonly approveEntryCorrection: (request: AgentRequest, decision: AgentDecision) => Promise<AgentResponse>;
  readonly approveGoalAllocation: (request: AgentRequest, decision: AgentDecision) => Promise<AgentResponse>;
  readonly learnFromReadOnlyTopicTurn: (request: AgentRequest) => Promise<void>;
  readonly respondConversationalTurn: (
    request: AgentRequest,
    recentTurns: readonly string[],
    baselineReply: string,
    pendingAction: "entry_correction" | "goal_allocation"
  ) => Promise<AgentResponse>;
}

/** Routes explicit replies to pending correction/allocation workflows without model authorization. */
export class PendingWorkflowResponseService {
  constructor(private readonly dependencies: {
    readonly corrections: PendingEntryCorrectionService;
    readonly goalAllocations: PendingGoalAllocationService;
    readonly conversationResponderEnabled: boolean;
    readonly callbacks: PendingWorkflowResponseCallbacks;
  }) {}

  async resolveEntryCorrection(
    request: AgentRequest,
    recentTurns: readonly string[]
  ): Promise<AgentResponse | undefined> {
    const conversationKey = workflowConversationKey(request);
    const pending = this.dependencies.corrections.getForConversation(request.userId, conversationKey);
    if (!pending) return undefined;
    const actionId = pending.actionId;
    const decision = pending.state.decision;
    const resolution = resolvePendingWorkflowMessage({
      message: request.message,
      workflow: "entry_correction",
      ...(decision.entryCorrection?.correctedAmountCents === undefined ? {} : {
        expectedAmountCents: decision.entryCorrection.correctedAmountCents
      })
    });
    if (resolution === "explicit_approval") {
      return this.dependencies.callbacks.approveEntryCorrection({ ...request, approvedActionId: actionId }, decision);
    }
    if (resolution === "explicit_decline") {
      this.dependencies.corrections.deleteByAction(actionId);
      const message = "No problem. The recorded savings entry remains unchanged.";
      return { message, decision: { ...decision, action: "reflect", userFacingMessage: message } };
    }
    if (resolution === "replacement_request") {
      this.dependencies.corrections.deleteByAction(actionId);
      const correctedAmount = decision.entryCorrection?.correctedAmountCents;
      const message = `I heard that you want a different correction. I canceled the pending ${correctedAmount === undefined ? "" : `${formatUsd(correctedAmount)} `}correction; the recorded entry is unchanged. Please send the new correction request so I can prepare a fresh confirmation.`;
      return { message, decision: { ...decision, action: "ask_follow_up", userFacingMessage: message } };
    }
    if (resolution === "ambiguous") {
      if (this.dependencies.conversationResponderEnabled) {
        return this.dependencies.callbacks.respondConversationalTurn(
          request, recentTurns,
          "I couldn't tell whether you're confirming the correction or asking about something else. The pending correction has not changed the recorded entry. Please tell me clearly whether you want me to make this exact correction.",
          "entry_correction"
        );
      }
      const message = "Please give me a clear yes or no before I correct this ledger entry.";
      return { message, decision: { ...decision, action: "ask_follow_up", userFacingMessage: message } };
    }
    if (resolution === "read_only_topic" && this.dependencies.conversationResponderEnabled) {
      await this.dependencies.callbacks.learnFromReadOnlyTopicTurn(request);
      return this.dependencies.callbacks.respondConversationalTurn(
        request, recentTurns,
        "I can help think that through. What part would be most useful to start with? The correction remains pending and the entry is unchanged.",
        "entry_correction"
      );
    }
    const message = "A savings correction is still waiting for your clear yes or no. The recorded entry has not changed.";
    return { message, decision: { ...decision, action: "ask_follow_up", userFacingMessage: message } };
  }

  async resolveGoalAllocation(
    request: AgentRequest,
    recentTurns: readonly string[]
  ): Promise<AgentResponse | undefined> {
    const pending = this.dependencies.goalAllocations.getForConversation(request.userId, workflowConversationKey(request));
    if (!pending) return undefined;
    const actionId = pending.actionId;
    const decision = pending.state.decision;
    const resolution = resolvePendingWorkflowMessage({
      message: request.message,
      workflow: "goal_allocation",
      ...(decision.goalAllocation?.amountCents === undefined ? {} : {
        expectedAmountCents: decision.goalAllocation.amountCents
      })
    });
    if (resolution === "explicit_approval") {
      return this.dependencies.callbacks.approveGoalAllocation({ ...request, approvedActionId: actionId }, decision);
    }
    if (resolution === "explicit_decline") {
      this.dependencies.goalAllocations.deleteByAction(actionId);
      const message = "No problem. The savings entry will stay as recorded without a goal allocation.";
      return { message, decision: { action: "reflect", classification: decision.classification, userFacingMessage: message } };
    }
    if (resolution === "replacement_request") {
      this.dependencies.goalAllocations.deleteByAction(actionId);
      const message = `I heard that you want a different goal. I canceled the pending ${decision.goalAllocation?.goalName ?? "goal"} allocation; nothing has been linked. Please send the new goal request so I can prepare a fresh confirmation.`;
      return { message, decision: { action: "ask_follow_up", classification: decision.classification, userFacingMessage: message } };
    }
    if (resolution === "ambiguous") {
      if (this.dependencies.conversationResponderEnabled) {
        return this.dependencies.callbacks.respondConversationalTurn(
          request, recentTurns,
          "I couldn't tell whether you're confirming this goal allocation or asking about something else. The allocation remains pending and has not been recorded. Please tell me clearly whether you want me to link this entry to the stated goal.",
          "goal_allocation"
        );
      }
      const message = "Please give me a clear yes or no before I link this entry to the goal.";
      return { message, decision: { action: "ask_follow_up", classification: decision.classification, userFacingMessage: message } };
    }
    if (resolution === "read_only_topic" && this.dependencies.conversationResponderEnabled) {
      await this.dependencies.callbacks.learnFromReadOnlyTopicTurn(request);
      return this.dependencies.callbacks.respondConversationalTurn(
        request, recentTurns,
        "I can help think that through. What part would be most useful to start with? The goal allocation remains pending and has not been recorded.",
        "goal_allocation"
      );
    }
    const message = "A goal allocation is still waiting for your clear yes or no. The entry has not been linked to a different goal.";
    return { message, decision: { action: "ask_follow_up", classification: decision.classification, userFacingMessage: message } };
  }
}

function workflowConversationKey(request: AgentRequest): string {
  return JSON.stringify([request.userId, request.conversationId ?? "default"]);
}
