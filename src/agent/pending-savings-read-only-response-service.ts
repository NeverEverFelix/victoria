import type { ActiveSavingsConversationState } from "./conversation-state-manager.js";
import { isSafePendingWorkflowTopicSwitch } from "./conversation-routing.js";
import type { BuiltTurnContext } from "./financial-fact-service.js";
import type { AgentDecision, AgentRequest, AgentResponse } from "./types.js";

export type PendingSavingsReadOnlyReplyKind = "topic_switch" | "ambiguous_confirmation";

/** Keeps pending savings replies conversational while preserving a read-only responder boundary. */
export class PendingSavingsReadOnlyResponseService {
  constructor(private readonly dependencies: {
    readonly responderEnabled: boolean;
    readonly learnFromReadOnlyTopicTurn: (request: AgentRequest) => Promise<void>;
    readonly respond: (
      request: AgentRequest,
      recentTurns: readonly string[],
      turnContext: BuiltTurnContext,
      workflowState: ActiveSavingsConversationState | undefined,
      baselineReply: string
    ) => Promise<AgentResponse>;
  }) {}

  async resolve(input: {
    readonly kind: PendingSavingsReadOnlyReplyKind;
    readonly request: AgentRequest;
    readonly recentTurns: readonly string[];
    readonly turnContext: BuiltTurnContext;
    readonly workflowState?: ActiveSavingsConversationState;
    readonly pendingDecision: AgentDecision;
  }): Promise<AgentResponse | undefined> {
    const { kind, request, recentTurns, turnContext, workflowState, pendingDecision } = input;
    if (kind === "topic_switch" && !isSafePendingWorkflowTopicSwitch(request.message)) return undefined;
    if (kind === "topic_switch" && this.dependencies.responderEnabled) {
      await this.dependencies.learnFromReadOnlyTopicTurn(request);
    }

    if (this.dependencies.responderEnabled) {
      const baselineReply = kind === "topic_switch"
        ? "I can help think that through. What part would be most useful to start with? The savings suggestion remains pending and has not been recorded."
        : "I couldn't tell whether you're confirming this exact savings entry or asking about something else. The suggestion remains pending and no ledger entry has been recorded. Please tell me clearly whether you want me to record it.";
      return this.dependencies.respond(request, recentTurns, turnContext, workflowState, baselineReply);
    }

    if (kind === "topic_switch") return undefined;
    const message = "Please give me a clear yes or no before I record this savings entry.";
    return { message, decision: {
      action: "ask_follow_up",
      classification: pendingDecision.classification,
      userFacingMessage: message
    } };
  }
}
