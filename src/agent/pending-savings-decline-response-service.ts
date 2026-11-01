import { answerBufferQuestion, answerRecurringProjectionQuestion, getPriorCoveredSpendProjection } from "./planning-response-policy.js";
import { freedRecurringSpend } from "./money-movement-intent.js";
import { ConversationMemoryContextService } from "./conversation-memory-context-service.js";
import { validatePersonalizedReply, type ConversationalReplyPersonalizer } from "./memory/personalized-reply.js";
import { selectPersonalizationMemories } from "./memory/personalized-ordinary-reply.js";
import type { BuiltTurnContext } from "./financial-fact-service.js";
import type { AgentDecision, AgentRequest, AgentResponse } from "./types.js";

/** Composes a decline acknowledgement with an optional separate read-only follow-up. */
export class PendingSavingsDeclineResponseService {
  constructor(private readonly dependencies: {
    readonly memoryContext: ConversationMemoryContextService;
    readonly personalizer?: ConversationalReplyPersonalizer;
    readonly respondToFollowUp: (
      request: AgentRequest,
      question: string,
      recentTurns: readonly string[]
    ) => Promise<AgentResponse>;
  }) {}

  async respond(input: {
    readonly request: AgentRequest;
    readonly recentTurns: readonly string[];
    readonly turnContext: BuiltTurnContext;
    readonly pendingDecision: AgentDecision;
    readonly declinedProposal?: AgentDecision["proposal"];
    readonly proposalTransitions?: AgentDecision["proposalTransitions"];
  }): Promise<AgentResponse> {
    const { request, recentTurns, turnContext, pendingDecision, declinedProposal, proposalTransitions } = input;
    const acknowledgement = "No problem. I won't record it.";
    const monthlyAmount = pendingDecision.planningChoice?.monthlyAmountCents ??
      [...recentTurns].reverse().map(freedRecurringSpend).find((spend) => spend?.cadence === "month")?.amountCents;
    const planningAnswer = answerRecurringProjectionQuestion(
      request.message, monthlyAmount, pendingDecision.suggestion?.amountCents
    );
    if (planningAnswer) {
      return this.compose(acknowledgement, planningAnswer, pendingDecision, declinedProposal, proposalTransitions, "reflect");
    }

    const followUpQuestion = turnContext.followUpAfterDecline ?? questionAfterDecline(request.message);
    if (!followUpQuestion) return this.declineOnly(acknowledgement, pendingDecision, declinedProposal, proposalTransitions);

    const bufferAnswer = answerBufferQuestion(followUpQuestion, pendingDecision.suggestion?.amountCents);
    if (bufferAnswer) {
      return this.compose(acknowledgement, bufferAnswer, pendingDecision, declinedProposal, proposalTransitions, "reflect");
    }

    const followUp = await this.personalizedFollowUp(request, followUpQuestion, recentTurns) ??
      await this.dependencies.respondToFollowUp(request, followUpQuestion, recentTurns);
    if ((followUp.decision.action === "reflect" || followUp.decision.action === "ask_follow_up") &&
        !followUp.decision.toolCall) {
      return this.compose(acknowledgement, followUp.message, followUp.decision, declinedProposal, proposalTransitions);
    }
    return this.declineOnly(acknowledgement, pendingDecision, declinedProposal, proposalTransitions);
  }

  private async personalizedFollowUp(
    request: AgentRequest,
    followUpQuestion: string,
    recentTurns: readonly string[]
  ): Promise<AgentResponse | undefined> {
    if (!this.dependencies.personalizer) return undefined;
    const followUpMemory = await this.dependencies.memoryContext.retrieve(
      request.userId, `${followUpQuestion} ${recentTurns.slice(-4).join(" ")}`
    );
    const memories = selectPersonalizationMemories(
      followUpMemory.conversationalMemories ?? [], followUpQuestion, recentTurns
    );
    if (memories.length === 0) return undefined;
    try {
      const input = {
        userMessage: followUpQuestion,
        baselineReply: "The pending ledger entry was declined. Answer the user's separate question.",
        memories,
        conversationContext: [...recentTurns, request.message],
        revisionFeedback: "The user's refusal has already been acknowledged. Answer the separate question directly without asking again for ledger confirmation.",
        ...getPriorCoveredSpendProjection(recentTurns)
      };
      let reply = validatePersonalizedReply(await this.dependencies.personalizer!.personalize(input), input);
      if (!reply) {
        const revision = {
          ...input,
          revisionFeedback: "The prior answer failed validation. Respect the decline, answer the separate question in one natural paragraph, do not offer ledger recording, and avoid investment products or numbered menus."
        };
        reply = validatePersonalizedReply(await this.dependencies.personalizer!.personalize(revision), revision);
      }
      if (!reply) return undefined;
      return {
        message: reply.message,
        decision: {
          action: "reflect",
          classification: { type: "general_finance", confidence: 1, summary: followUpQuestion, needsClarification: false },
          userFacingMessage: reply.message
        }
      };
    } catch {
      // Optional personalization cannot change the already completed decline.
      return undefined;
    }
  }

  private compose(
    acknowledgement: string,
    followUpMessage: string,
    decision: AgentDecision,
    declinedProposal: AgentDecision["proposal"],
    proposalTransitions: AgentDecision["proposalTransitions"],
    action?: "reflect"
  ): AgentResponse {
    const message = `${acknowledgement} ${followUpMessage}`;
    return { message, decision: {
      ...decision,
      ...(action ? { action } : {}),
      ...(declinedProposal ? { proposal: declinedProposal } : {}),
      ...(proposalTransitions?.length ? { proposalTransitions } : {}),
      userFacingMessage: message
    } };
  }

  private declineOnly(
    message: string,
    decision: AgentDecision,
    declinedProposal: AgentDecision["proposal"],
    proposalTransitions: AgentDecision["proposalTransitions"]
  ): AgentResponse {
    return { message, decision: {
      ...decision,
      action: "reflect",
      ...(declinedProposal ? { proposal: declinedProposal } : {}),
      ...(proposalTransitions?.length ? { proposalTransitions } : {}),
      userFacingMessage: message
    } };
  }
}

function questionAfterDecline(message: string): string | undefined {
  const match = message.match(/^[^.!?]+[.!?]\s*(.+\?)\s*$/s);
  return match?.[1]?.trim();
}
