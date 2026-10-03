import type { LlmAdapter } from "./llm/types.js";
import type { MemoryProvider } from "./memory/types.js";
import { canCallTool, interpretApprovalResponse } from "./policy.js";
import type { VictoriaTools } from "./tools/contracts.js";
import { formatUsd } from "../domain/money.js";
import type {
  AgentDecision,
  AgentRequest,
  AgentResponse,
  ClassifiedMessage,
  SavingsEvent,
  SavingsProposal,
  SavingsSuggestion
} from "./types.js";

export interface VictoriaAgentDependencies {
  llm: LlmAdapter;
  memory: MemoryProvider;
  tools: VictoriaTools;
}

export class VictoriaAgent {
  private readonly pendingSavingsActions = new Map<
    string,
    { userId: string; conversationKey: string; decision: AgentDecision }
  >();
  private readonly pendingActionIdsByConversation = new Map<string, string>();
  private readonly pendingAmountClarifications = new Map<
    string,
    { userId: string; classification: ClassifiedMessage; savingsEvent: SavingsEvent }
  >();
  private nextActionNumber = 1;
  private nextEventNumber = 1;
  private nextProposalNumber = 1;
  private nextApprovalNumber = 1;

  constructor(private readonly dependencies: VictoriaAgentDependencies) {}

  async respond(request: AgentRequest): Promise<AgentResponse> {
    const pendingActionId = this.pendingActionIdsByConversation.get(this.conversationKey(request));
    const pendingAction = pendingActionId
      ? this.pendingSavingsActions.get(pendingActionId)
      : undefined;

    if (pendingAction && pendingActionId) {
      const approvalResponse = interpretApprovalResponse(request.message);

      if (approvalResponse === "explicit_approval") {
        return this.approveToolCall(
          { ...request, approvedActionId: pendingActionId },
          pendingAction.decision
        );
      }

      if (approvalResponse === "explicit_decline") {
        const message = "No problem. I won't record it.";
        const actionId = pendingAction.decision.toolCall?.actionId;
        const proposal = pendingAction.decision.proposal;
        const declinedProposal: SavingsProposal | undefined =
          proposal?.status === "pending"
            ? {
                ...proposal,
                status: "declined",
                declinedAt: new Date().toISOString()
              }
            : undefined;

        if (actionId) {
          this.pendingSavingsActions.delete(actionId);
        }
        this.pendingActionIdsByConversation.delete(this.conversationKey(request));

        return {
          message,
          decision: {
            ...pendingAction.decision,
            action: "reflect",
            ...(declinedProposal ? { proposal: declinedProposal } : {}),
            userFacingMessage: message
          }
        };
      }

      if (approvalResponse === "ambiguous") {
        const message = "Please give me a clear yes or no before I record this savings entry.";

        return {
          message,
          decision: {
            action: "ask_follow_up",
            classification: pendingAction.decision.classification,
            userFacingMessage: message
          }
        };
      }
    }

    const memory = await this.dependencies.memory.getMemoryForUser(request.userId);
    const classification = await this.dependencies.llm.classifyMessage({
      userMessage: request.message,
      memory
    });

    const pendingClarification = this.pendingAmountClarifications.get(this.conversationKey(request));
    let resolvedSavingsEvent: SavingsEvent | undefined;
    const resolvedClassification =
      pendingClarification?.userId === request.userId &&
      classification.amountCents !== undefined &&
      classification.type === "unclear"
        ? {
            ...pendingClarification.classification,
            amountCents: classification.amountCents,
            needsClarification: false
          }
        : classification;

    if (resolvedClassification !== classification) {
      resolvedSavingsEvent = pendingClarification?.savingsEvent;
      this.pendingAmountClarifications.delete(this.conversationKey(request));
    } else if (pendingClarification && classification.type !== "unclear") {
      this.pendingAmountClarifications.delete(this.conversationKey(request));
    }

    const decision = await this.decide(request, resolvedClassification, resolvedSavingsEvent);

    return {
      message: decision.userFacingMessage,
      decision
    };
  }

  private async decide(
    request: AgentRequest,
    classification: ClassifiedMessage,
    savingsEvent?: SavingsEvent
  ): Promise<AgentDecision> {
    if (classification.needsClarification || classification.type === "unclear") {
      return {
        action: "ask_follow_up",
        classification,
        userFacingMessage:
          "I can help with that. What did you avoid spending on, and about how much would it have cost?"
      };
    }

    if (classification.type === "regretful_spend") {
      return {
        action: "reflect",
        classification,
        userFacingMessage:
          "No shame. Want to look at what led to it and set up a small plan for next time?"
      };
    }

    if (classification.type === "avoided_spend") {
      return this.suggestSavings(request, classification, savingsEvent);
    }

    if (classification.type === "goal_allocation") {
      return {
        action: "update_goal",
        classification,
        userFacingMessage: "Got it. Which saved amount should I put toward that goal?"
      };
    }

    return {
      action: "reflect",
      classification,
      userFacingMessage:
        "I am here with you. Tell me a little more about the money decision you are thinking through."
    };
  }

  private async suggestSavings(
    request: AgentRequest,
    classification: ClassifiedMessage,
    existingSavingsEvent?: SavingsEvent
  ): Promise<AgentDecision> {
    const savingsEvent = existingSavingsEvent ?? this.buildSavingsEvent(request, classification);
    const suggestion = await this.dependencies.tools.estimateAvoidedSpend({
      userId: request.userId,
      ...(classification.merchantName ? { merchantName: classification.merchantName } : {}),
      ...(classification.amountCents !== undefined
        ? { userProvidedAmountCents: classification.amountCents }
        : {})
    });

    if (!suggestion) {
      this.pendingAmountClarifications.set(this.conversationKey(request), {
        userId: request.userId,
        classification,
        savingsEvent
      });

      return {
        action: "ask_follow_up",
        classification,
        savingsEvent,
        userFacingMessage:
          "Nice choice. About how much would you have spent if you had gone through with it?"
      };
    }

    const decision = this.buildSavingsSuggestionDecision(classification, savingsEvent, suggestion);
    const actionId = decision.toolCall?.actionId;

    if (actionId) {
      const conversationKey = this.conversationKey(request);
      this.pendingSavingsActions.set(actionId, {
        userId: request.userId,
        conversationKey,
        decision
      });
      this.pendingActionIdsByConversation.set(conversationKey, actionId);
    }

    return decision;
  }

  private buildSavingsSuggestionDecision(
    classification: ClassifiedMessage,
    savingsEvent: SavingsEvent,
    suggestion: SavingsSuggestion
  ): AgentDecision {
    const dollars = formatUsd(suggestion.amountCents);
    const actionId = `savings_action_${this.nextActionNumber++}`;
    const proposal: SavingsProposal = {
      id: `proposal_${this.nextProposalNumber++}`,
      eventId: savingsEvent.id,
      userId: savingsEvent.userId,
      suggestion: {
        id: suggestion.id,
        amountCents: suggestion.amountCents,
        currency: suggestion.currency,
        reason: suggestion.reason,
        source: suggestion.source,
        movementMode: "mock_ledger"
      },
      status: "pending",
      createdAt: new Date().toISOString()
    };

    const evidence =
      suggestion.source === "user_provided"
        ? `Using the ${dollars} amount you provided, would you like me to record it`
        : `Great job. I estimate you avoided spending ${dollars}. Would you like me to record that`;

    return {
      action: "suggest_savings",
      classification,
      savingsEvent,
      proposal,
      suggestion,
      toolCall: {
        name: "createSavingsEntry",
        actionId,
        arguments: {
          eventId: savingsEvent.id,
          proposalId: proposal.id,
          suggestionId: suggestion.id,
          amountCents: suggestion.amountCents,
          reason: suggestion.reason,
          movementMode: suggestion.movementMode
        },
        requiresApproval: true,
        movementMode: suggestion.movementMode
      },
      userFacingMessage: `${evidence} in your Victoria savings ledger? No real money has moved yet.`
    };
  }

  private buildSavingsEvent(
    request: AgentRequest,
    classification: ClassifiedMessage
  ): SavingsEvent {
    return {
      id: `event_${this.nextEventNumber++}`,
      userId: request.userId,
      type: "avoided_spend",
      summary: classification.summary,
      ...(classification.merchantName ? { merchantName: classification.merchantName } : {}),
      ...(classification.amountCents !== undefined
        ? { userProvidedAmountCents: classification.amountCents }
        : {}),
      classificationConfidence: classification.confidence,
      createdAt: new Date().toISOString()
    };
  }

  async approveToolCall(request: AgentRequest, decision: AgentDecision): Promise<AgentResponse> {
    if (!decision.toolCall || !decision.suggestion) {
      return {
        message: "There is no savings action waiting for approval.",
        decision: {
          ...decision,
          action: "refuse",
          userFacingMessage: "There is no savings action waiting for approval."
        }
      };
    }

    const approvedActionId = request.approvedActionId;
    const pendingAction = approvedActionId
      ? this.pendingSavingsActions.get(approvedActionId)
      : undefined;

    if (approvedActionId && (!pendingAction || pendingAction.userId !== request.userId)) {
      return this.refuseApproval(
        decision,
        "That approval does not match a pending savings action."
      );
    }

    const trustedDecision = pendingAction?.decision ?? decision;
    const trustedToolCall = trustedDecision.toolCall;
    const trustedSuggestion = trustedDecision.suggestion;
    const trustedProposal = trustedDecision.proposal;
    const trustedEvent = trustedDecision.savingsEvent;

    if (!trustedToolCall || !trustedSuggestion || !trustedProposal || !trustedEvent) {
      return this.refuseApproval(decision, "There is no savings action waiting for approval.");
    }

    if (trustedProposal.status !== "pending") {
      return this.refuseApproval(decision, "That savings action is no longer pending.");
    }

    const policyDecision = canCallTool(request, trustedToolCall);

    if (!policyDecision.allowed) {
      return {
        message: policyDecision.reason ?? "That action needs approval first.",
        decision: {
          ...trustedDecision,
          action: "refuse",
          userFacingMessage: policyDecision.reason ?? "That action needs approval first."
        }
      };
    }

    const approvedActionIdForEntry = request.approvedActionId;

    if (!approvedActionIdForEntry) {
      return this.refuseApproval(
        trustedDecision,
        "Savings ledger entries require approval for this exact action."
      );
    }

    const approval = {
      id: `approval_${this.nextApprovalNumber++}`,
      proposalId: trustedProposal.id,
      userId: request.userId,
      actionId: approvedActionIdForEntry,
      source: "user_message" as const,
      approvedAt: new Date().toISOString()
    };
    const createSavingsEntryInput = {
      userId: request.userId,
      eventId: trustedEvent.id,
      proposalId: trustedProposal.id,
      approvalId: approval.id,
      suggestionId: trustedSuggestion.id,
      amountCents: trustedSuggestion.amountCents,
      reason: trustedSuggestion.reason,
      movementMode: trustedSuggestion.movementMode,
      approvedActionId: approvedActionIdForEntry
    };

    const entry = await this.dependencies.tools.createSavingsEntry(createSavingsEntryInput);
    const completedActionId = trustedToolCall.actionId ?? "";
    const completedAction = this.pendingSavingsActions.get(completedActionId);
    this.pendingSavingsActions.delete(completedActionId);
    if (completedAction) {
      this.pendingActionIdsByConversation.delete(completedAction.conversationKey);
    }

    const message = `Done. I recorded ${formatUsd(entry.amountCents)} in your Victoria savings ledger. No real money has moved yet.`;

    return {
      message,
      decision: {
        ...trustedDecision,
        action: "create_ledger_entry",
        proposal: {
          ...trustedProposal,
          status: "recorded",
          approval,
          ledgerEntryId: entry.id,
          recordedAt: entry.createdAt
        },
        userFacingMessage: message
      }
    };
  }

  private refuseApproval(decision: AgentDecision, message: string): AgentResponse {
    return {
      message,
      decision: {
        ...decision,
        action: "refuse",
        userFacingMessage: message
      }
    };
  }

  private conversationKey(request: AgentRequest): string {
    return `${request.userId}:${request.conversationId ?? "default"}`;
  }
}
