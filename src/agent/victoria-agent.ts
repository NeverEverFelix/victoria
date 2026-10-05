import type { MemoryProvider } from "./memory/types.js";
import { canCallTool, interpretApprovalResponse } from "./policy.js";
import type { VictoriaTools } from "./tools/contracts.js";
import { formatUsd } from "../domain/money.js";
import type {
  PendingSavingsGoalAllocation,
  SavingsEntry,
  SavingsGoalAllocation
} from "../domain/savings/types.js";
import type {
  AgentDecision,
  AgentRequest,
  AgentResponse,
  ClassifiedMessage,
  SavingsEvent,
  SavingsProposal,
  SavingsSuggestion
} from "./types.js";
import { coordinateSpecialists, type SpecialistTeam } from "./specialists/coordinator.js";
import {
  isSafeCompanionVoiceDraft,
  type CompanionVoiceSpecialist,
  type VerifiedResponseOutcome
} from "./specialists/companion-voice.js";
import {
  createSpecialistTrace,
  recordTraceSafely,
  InMemorySpecialistTraceSink,
  type SpecialistHandoffTrace,
  type SpecialistTraceSink
} from "./specialists/tracing.js";
import {
  CompanionVoiceInputSchema,
  CompanionVoiceOutputSchema,
  HANDOFF_SCHEMA_VERSION
} from "./specialists/handoff-schemas.js";

export interface VictoriaAgentDependencies {
  memory: MemoryProvider;
  tools: VictoriaTools;
  specialists: SpecialistTeam;
  voice?: CompanionVoiceSpecialist;
  traceSink?: SpecialistTraceSink;
}

export class VictoriaAgent {
  private readonly traceBuffer = new InMemorySpecialistTraceSink(1000);
  private readonly pendingSavingsActions = new Map<
    string,
    { userId: string; conversationKey: string; decision: AgentDecision; awaitingValidRevision?: boolean }
  >();
  private readonly pendingActionIdsByConversation = new Map<string, string>();
  private readonly pendingGoalAllocationActions = new Map<
    string,
    { userId: string; conversationKey: string; decision: AgentDecision }
  >();
  private readonly pendingGoalAllocationIdsByConversation = new Map<string, string>();
  private readonly recentSavingsEntriesByConversation = new Map<string, SavingsEntry>();
  private readonly pendingAmountClarifications = new Map<
    string,
    { userId: string; classification: ClassifiedMessage; savingsEvent: SavingsEvent }
  >();
  private nextActionNumber = 1;
  private nextEventNumber = 1;
  private nextProposalNumber = 1;
  private nextApprovalNumber = 1;
  private nextGoalAllocationNumber = 1;
  private nextGoalApprovalNumber = 1;

  constructor(private readonly dependencies: VictoriaAgentDependencies) {}

  getRecentSpecialistHandoffTraces(): SpecialistHandoffTrace[] {
    return this.traceBuffer.list();
  }

  async respond(request: AgentRequest): Promise<AgentResponse> {
    const correlationId = globalThis.crypto.randomUUID();
    const response = await this.respondWithoutVoice(request, correlationId);
    return this.composeWithVoice(response, correlationId);
  }

  private async respondWithoutVoice(request: AgentRequest, correlationId: string): Promise<AgentResponse> {
    const conversationKey = this.conversationKey(request);
    const pendingGoalActionId = this.pendingGoalAllocationIdsByConversation.get(conversationKey);
    const pendingGoalAction = pendingGoalActionId
      ? this.pendingGoalAllocationActions.get(pendingGoalActionId)
      : undefined;

    if (pendingGoalAction && pendingGoalActionId) {
      const approvalResponse = interpretApprovalResponse(request.message);
      if (approvalResponse === "explicit_approval") {
        return this.approveGoalAllocation(
          { ...request, approvedActionId: pendingGoalActionId },
          pendingGoalAction.decision
        );
      }
      if (approvalResponse === "explicit_decline") {
        const message = "No problem. The savings entry will stay as recorded without a goal allocation.";
        this.pendingGoalAllocationActions.delete(pendingGoalActionId);
        this.pendingGoalAllocationIdsByConversation.delete(conversationKey);
        return {
          message,
          decision: {
            action: "reflect",
            classification: pendingGoalAction.decision.classification,
            userFacingMessage: message
          }
        };
      }
      if (approvalResponse === "ambiguous") {
        const message = "Please give me a clear yes or no before I link this entry to the goal.";
        return {
          message,
          decision: {
            action: "ask_follow_up",
            classification: pendingGoalAction.decision.classification,
            userFacingMessage: message
          }
        };
      }
    }

    const pendingActionId = this.pendingActionIdsByConversation.get(conversationKey);
    const pendingAction = pendingActionId
      ? this.pendingSavingsActions.get(pendingActionId)
      : undefined;

    if (pendingAction && pendingActionId) {
      const approvalResponse = interpretApprovalResponse(request.message);

      if (
        pendingAction.awaitingValidRevision &&
        (approvalResponse === "explicit_approval" || approvalResponse === "ambiguous")
      ) {
        const message = "I need a valid USD amount for that correction before asking you to confirm. Please provide one unambiguous amount or decline the pending suggestion.";
        return {
          message,
          decision: {
            ...pendingAction.decision,
            action: "ask_follow_up",
            userFacingMessage: message
          }
        };
      }

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

    let classification: ClassifiedMessage;
    let specialistSuggestion: SavingsSuggestion | null | undefined;
    const coordinated = await coordinateSpecialists(this.dependencies.specialists, {
      userMessage: request.message
    }, {
      correlationId,
      traceSink: { record: (trace) => this.recordTrace(trace) },
      estimateSpend: (facts, signal) => this.dependencies.tools.estimateAvoidedSpend({
        userId: request.userId,
        ...(facts.merchantName ? { merchantName: facts.merchantName } : {}),
        ...(facts.userProvidedAmountCents !== undefined
          ? { userProvidedAmountCents: facts.userProvidedAmountCents }
          : {}),
        signal
      })
    });
    if (coordinated.status === "clarify" && coordinated.reason !== "moment_needs_clarification") {
      const safeClassification = coordinated.classification ?? {
        type: "unclear" as const,
        confidence: 0,
        summary: request.message,
        needsClarification: true
      };
      const message = coordinated.reason === "specialist_disagreement"
        ? "I got conflicting information about that savings amount, so I haven't prepared a savings suggestion. What amount should I use?"
        : "I couldn't confidently understand that financial moment, so I haven't prepared a savings suggestion. Could you tell me a little more?";
      return {
        message,
        decision: {
          action: "ask_follow_up",
          classification: safeClassification,
          userFacingMessage: message
        }
      };
    }
    if (coordinated.status === "ready") {
      classification = coordinated.classification;
      specialistSuggestion = coordinated.recommendation.kind === "suggest"
        ? coordinated.recommendation
        : coordinated.recommendation.kind === "no_suggestion"
        ? null
        : undefined;
    } else {
      classification = coordinated.classification!;
    }

    if (classification.type === "real_money_movement_request") {
      const pendingAmountCents = pendingAction?.decision.suggestion?.amountCents;
      const pendingGoalAllocation = pendingGoalAction?.decision.goalAllocation;
      const pendingAmount = pendingGoalAllocation?.status === "pending"
        ? pendingGoalAllocation.amountCents
        : pendingAmountCents;
      const message = pendingGoalAllocation?.status === "pending"
        ? `I can't move real money in the Victoria MVP. I can record the ${formatUsd(pendingGoalAllocation.amountCents)} goal allocation toward ${pendingGoalAllocation.goalName} in the mocked Victoria savings ledger after you explicitly confirm. No transfer has been made.`
        : pendingAmount === undefined
        ? "I can't move real money in the Victoria MVP. I can only record savings in the mocked Victoria savings ledger after we identify an amount and you explicitly confirm. No transfer has been made."
        : `I can't move real money in the Victoria MVP. I can record ${formatUsd(pendingAmount)} in the mocked Victoria savings ledger after you confirm. No transfer has been made.`;

      return {
        message,
        decision: {
          action: "refuse",
          classification,
          userFacingMessage: message
        }
      };
    }

    if (pendingGoalAction) {
      const message = "Please confirm or decline linking this savings entry to the goal.";
      return {
        message,
        decision: {
          action: "ask_follow_up",
          classification: pendingGoalAction.decision.classification,
          userFacingMessage: message
        }
      };
    }

    if (
      pendingActionId &&
      pendingAction &&
      pendingAction.userId === request.userId &&
      classification.type === "goal_allocation"
    ) {
      if (!classification.goalName) {
        const message = "Which savings goal should I use for this amount?";
        return {
          message,
          decision: {
            ...pendingAction.decision,
            action: "ask_follow_up",
            classification,
            userFacingMessage: message
          }
        };
      }

      return this.attachGoalToPendingAction(request, pendingAction.decision, classification);
    }

    if (
      pendingActionId &&
      pendingAction &&
      pendingAction.userId === request.userId &&
      classification.type === "proposal_revision"
    ) {
      if (classification.amountIssue) {
        this.pendingSavingsActions.set(pendingActionId, {
          ...pendingAction,
          awaitingValidRevision: true
        });
        const message = classification.amountIssue === "invalid_value"
          ? "A savings amount must be positive, so I haven't changed the pending suggestion. What positive amount in USD should I use?"
          : classification.amountIssue === "multiple_amounts"
          ? "I found more than one dollar amount, so I haven't changed the pending suggestion. Which single amount in USD should I use?"
          : classification.amountIssue === "invalid_precision"
          ? "That revised amount has more than two decimal places, so I haven't changed the pending suggestion. What amount in USD should I use?"
          : "I can only record USD amounts, so I haven't changed the pending suggestion. What amount in USD should I use?";
        return {
          message,
          decision: {
            ...pendingAction.decision,
            action: "ask_follow_up",
            classification,
            userFacingMessage: message
          }
        };
      }
      if (
        classification.amountCents !== undefined ||
        classification.revisionReason !== undefined ||
        pendingAction.awaitingValidRevision
      ) {
        if (pendingAction.awaitingValidRevision && classification.amountCents === undefined) {
          const message = "Please provide a valid USD amount for the correction and make it unambiguous, or decline the pending suggestion.";
          return {
            message,
            decision: {
              ...pendingAction.decision,
              action: "ask_follow_up",
              classification,
              userFacingMessage: message
            }
          };
        }
        return this.replacePendingSavingsProposal(request, pendingAction.decision, classification);
      }

      const currentAmount = pendingAction.decision.proposal?.suggestion.amountCents;
      const message = currentAmount === undefined
        ? "I couldn't identify a supported change. The current savings suggestion is unchanged and still pending. Please confirm or decline it."
        : `I can only revise the amount or reason here. The current suggestion remains ${formatUsd(currentAmount)} in USD in the mocked ledger and is still pending. Please confirm or decline that exact suggestion.`;
      return {
        message,
        decision: {
          ...pendingAction.decision,
          action: "ask_follow_up",
          classification,
          userFacingMessage: message
        }
      };
    }

    if (pendingAction?.awaitingValidRevision && classification.amountCents !== undefined) {
      return this.replacePendingSavingsProposal(request, pendingAction.decision, {
        ...classification,
        type: "proposal_revision"
      });
    }

    if (pendingAction) {
      const amountCents = pendingAction.decision.proposal?.suggestion.amountCents;
      const message = amountCents === undefined
        ? "A savings suggestion is still pending. Please confirm or decline it before starting another savings action."
        : `The ${formatUsd(amountCents)} savings suggestion is still pending. Please confirm or decline it before starting another savings action.`;
      return {
        message,
        decision: {
          ...pendingAction.decision,
          action: "ask_follow_up",
          classification,
          userFacingMessage: message
        }
      };
    }

    if (classification.type === "goal_allocation" && classification.goalName) {
      const recentEntry = this.recentSavingsEntriesByConversation.get(conversationKey);
      if (recentEntry?.userId === request.userId) {
        return this.proposeGoalAllocation(request, classification, recentEntry);
      }
    }

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

    const decision = await this.decide(
      request,
      resolvedClassification,
      resolvedSavingsEvent,
      specialistSuggestion
    );

    return {
      message: decision.userFacingMessage,
      decision
    };
  }

  private async decide(
    request: AgentRequest,
    classification: ClassifiedMessage,
    savingsEvent?: SavingsEvent,
    specialistSuggestion?: SavingsSuggestion | null
  ): Promise<AgentDecision> {
    if (classification.type === "savings_progress") {
      let message: string;
      try {
        const amountCents = await this.dependencies.tools.getWeeklySavingsTotal(request.userId);
        message = amountCents === 0
          ? "No savings have been recorded in your mocked Victoria savings ledger this week. No real money has moved yet."
          : `You have ${formatUsd(amountCents)} recorded in your mocked Victoria savings ledger this week. No real money has moved yet.`;
      } catch {
        message = "I couldn't load your weekly total just now. No real money has moved yet.";
      }

      return {
        action: "summarize_progress",
        classification,
        toolCall: {
          name: "getWeeklySavingsTotal",
          arguments: { userId: request.userId },
          requiresApproval: false
        },
        userFacingMessage: message
      };
    }

    if (classification.needsClarification || classification.type === "unclear") {
      const amountClarification = classification.amountIssue === "invalid_value"
        ? "A savings amount must be positive. What positive amount in USD should I use?"
        : classification.amountIssue === "multiple_amounts"
        ? "I found more than one dollar amount. Which single amount in USD should I use?"
        : classification.amountIssue === "invalid_precision"
        ? "That amount has more than two decimal places. What amount in USD should I use?"
        : classification.amountIssue === "unsupported_currency"
        ? "I can only record USD amounts in the MVP. What is the amount in USD?"
        : "I can help with that. What did you avoid spending on, and about how much would it have cost?";
      return {
        action: "ask_follow_up",
        classification,
        userFacingMessage: amountClarification
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
      return this.suggestSavings(request, classification, savingsEvent, specialistSuggestion);
    }

    if (classification.type === "goal_allocation") {
      return {
        action: "update_goal",
        classification,
        userFacingMessage: classification.goalName
          ? "Which saved amount should I link to that goal?"
          : "Which savings goal and saved amount do you mean?"
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
    existingSavingsEvent?: SavingsEvent,
    specialistSuggestion?: SavingsSuggestion | null
  ): Promise<AgentDecision> {
    const savingsEvent = existingSavingsEvent ?? this.buildSavingsEvent(request, classification);
    this.recentSavingsEntriesByConversation.delete(this.conversationKey(request));
    let suggestion: SavingsSuggestion | null;
    try {
      suggestion = specialistSuggestion === undefined
        ? await this.dependencies.tools.estimateAvoidedSpend({
            userId: request.userId,
            ...(classification.merchantName ? { merchantName: classification.merchantName } : {}),
            ...(classification.amountCents !== undefined
              ? { userProvidedAmountCents: classification.amountCents }
              : {}),
            signal: AbortSignal.timeout(10_000)
          })
        : specialistSuggestion;
    } catch {
      const message = "I couldn't check that savings estimate just now. Please try again in a moment, or tell me the amount you would have spent.";
      return {
        action: "ask_follow_up",
        classification,
        savingsEvent,
        userFacingMessage: message
      };
    }

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

  private attachGoalToPendingAction(
    request: AgentRequest,
    pendingDecision: AgentDecision,
    classification: ClassifiedMessage
  ): AgentResponse {
    const previousActionId = pendingDecision.toolCall?.actionId;
    const goalName = classification.goalName;
    const proposal = pendingDecision.proposal;
    const toolCall = pendingDecision.toolCall;

    if (!previousActionId || !goalName || !proposal || proposal.status !== "pending" || !toolCall) {
      const message = "I couldn't match that goal to a pending savings suggestion.";
      return {
        message,
        decision: { ...pendingDecision, action: "ask_follow_up", userFacingMessage: message }
      };
    }

    const nextActionId = `savings_action_${this.nextActionNumber++}`;
    const amountCents = pendingDecision.suggestion?.amountCents ?? proposal.suggestion.amountCents;
    const message = `I can record ${formatUsd(amountCents)} in your mocked Victoria savings ledger toward ${goalName}. Please confirm: should I record it? No real money has moved yet.`;
    const updatedProposal: SavingsProposal = {
      ...proposal,
      id: `proposal_${this.nextProposalNumber++}`,
      supersedesProposalId: proposal.id,
      goalName,
      createdAt: new Date().toISOString()
    };
    const updatedDecision: AgentDecision = {
      ...pendingDecision,
      action: "update_goal",
      classification,
      proposal: updatedProposal,
      toolCall: {
        ...toolCall,
        actionId: nextActionId,
        arguments: { ...toolCall.arguments, proposalId: updatedProposal.id, goalName }
      },
      userFacingMessage: message
    };

    const conversationKey = this.conversationKey(request);
    this.pendingSavingsActions.delete(previousActionId);
    this.pendingSavingsActions.set(nextActionId, {
      userId: request.userId,
      conversationKey,
      decision: updatedDecision
    });
    this.pendingActionIdsByConversation.set(conversationKey, nextActionId);

    return { message, decision: updatedDecision };
  }

  private replacePendingSavingsProposal(
    request: AgentRequest,
    pendingDecision: AgentDecision,
    classification: ClassifiedMessage
  ): AgentResponse {
    const previousActionId = pendingDecision.toolCall?.actionId;
    const previousProposal = pendingDecision.proposal;
    const savingsEvent = pendingDecision.savingsEvent;
    const currentSuggestion = pendingDecision.suggestion;
    if (
      !previousActionId ||
      !previousProposal ||
      previousProposal.status !== "pending" ||
      !savingsEvent ||
      !currentSuggestion
    ) {
      const message = "I couldn't match that change to a pending savings suggestion.";
      return { message, decision: { ...pendingDecision, action: "ask_follow_up", userFacingMessage: message } };
    }

    const suggestion: SavingsSuggestion = {
      ...currentSuggestion,
      id: `suggestion_${this.nextProposalNumber}`,
      ...(classification.amountCents !== undefined
        ? { amountCents: classification.amountCents, source: "user_provided" as const }
        : {}),
      ...(classification.revisionReason !== undefined
        ? { reason: classification.revisionReason }
        : {})
    };
    const nextDecision = this.buildSavingsSuggestionDecision(classification, savingsEvent, suggestion);
    const nextActionId = nextDecision.toolCall?.actionId;
    const nextProposal = nextDecision.proposal;
    const nextToolCall = nextDecision.toolCall;
    if (!nextActionId || !nextProposal || !nextToolCall) {
      const message = "I couldn't prepare a replacement suggestion. The original remains pending.";
      return { message, decision: { ...pendingDecision, action: "ask_follow_up", userFacingMessage: message } };
    }

    const linkedProposal: SavingsProposal = {
      ...nextProposal,
      supersedesProposalId: previousProposal.id,
      ...(previousProposal.goalName ? { goalName: previousProposal.goalName } : {})
    };
    const revisedDecision: AgentDecision = {
      ...nextDecision,
      proposal: linkedProposal,
      toolCall: {
        ...nextToolCall,
        arguments: {
          ...nextToolCall.arguments,
          proposalId: linkedProposal.id,
          ...(linkedProposal.goalName ? { goalName: linkedProposal.goalName } : {})
        }
      }
    };
    const conversationKey = this.conversationKey(request);
    this.pendingSavingsActions.delete(previousActionId);
    this.pendingSavingsActions.set(nextActionId, {
      userId: request.userId,
      conversationKey,
      decision: revisedDecision
    });
    this.pendingActionIdsByConversation.set(conversationKey, nextActionId);
    return { message: revisedDecision.userFacingMessage, decision: revisedDecision };
  }

  private proposeGoalAllocation(
    request: AgentRequest,
    classification: ClassifiedMessage,
    entry: SavingsEntry
  ): AgentResponse {
    const actionId = `goal_allocation_action_${this.nextGoalAllocationNumber++}`;
    const goalAllocation: PendingSavingsGoalAllocation = {
      id: `goal_allocation_proposal_${this.nextGoalAllocationNumber - 1}`,
      userId: request.userId,
      savingsEntryId: entry.id,
      amountCents: entry.amountCents,
      goalName: classification.goalName ?? "",
      status: "pending",
      createdAt: new Date().toISOString()
    };
    const message = `I can link the recorded ${formatUsd(entry.amountCents)} entry to ${goalAllocation.goalName} in your mocked savings ledger. Please confirm this goal allocation. No real money has moved yet.`;
    const decision: AgentDecision = {
      action: "update_goal",
      classification,
      goalAllocation,
      toolCall: {
        name: "createSavingsGoalAllocation",
        actionId,
        arguments: {
          userId: request.userId,
          savingsEntryId: entry.id,
          amountCents: entry.amountCents,
          goalName: goalAllocation.goalName
        },
        requiresApproval: true
      },
      userFacingMessage: message
    };
    const conversationKey = this.conversationKey(request);
    this.pendingGoalAllocationActions.set(actionId, {
      userId: request.userId,
      conversationKey,
      decision
    });
    this.pendingGoalAllocationIdsByConversation.set(conversationKey, actionId);

    return { message, decision };
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
    if (decision.toolCall?.name === "createSavingsGoalAllocation") {
      return this.approveGoalAllocation(request, decision);
    }

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
      ...(trustedProposal.goalName ? { goalName: trustedProposal.goalName } : {}),
      movementMode: trustedSuggestion.movementMode,
      approvedActionId: approvedActionIdForEntry
    };

    let entry: SavingsEntry;
    try {
      entry = await this.dependencies.tools.createSavingsEntry(createSavingsEntryInput);
    } catch {
      const message = "I couldn't confirm whether the entry was recorded, so I haven't marked this action complete. You can say yes to safely retry the same entry. No real money has moved yet.";
      return {
        message,
        decision: {
          ...trustedDecision,
          action: "ask_follow_up",
          userFacingMessage: message
        }
      };
    }
    this.recentSavingsEntriesByConversation.set(this.conversationKey(request), entry);
    const completedActionId = trustedToolCall.actionId ?? "";
    const completedAction = this.pendingSavingsActions.get(completedActionId);
    this.pendingSavingsActions.delete(completedActionId);
    if (completedAction) {
      this.pendingActionIdsByConversation.delete(completedAction.conversationKey);
    }

    const goalText = entry.goalName ? ` toward ${entry.goalName}` : "";
    let weeklyProgress: string;
    try {
      const weeklyTotalCents = await this.dependencies.tools.getWeeklySavingsTotal(request.userId);
      weeklyProgress = ` Your total in the mocked Victoria savings ledger this week is ${formatUsd(weeklyTotalCents)}.`;
    } catch {
      weeklyProgress = " I couldn't load your weekly total just now.";
    }
    const message = `Done. I recorded ${formatUsd(entry.amountCents)}${goalText} in your Victoria savings ledger.${weeklyProgress} No real money has moved yet.`;

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

  private async approveGoalAllocation(
    request: AgentRequest,
    decision: AgentDecision
  ): Promise<AgentResponse> {
    const actionId = request.approvedActionId;
    const pendingAction = actionId
      ? this.pendingGoalAllocationActions.get(actionId)
      : undefined;
    if (!actionId || !pendingAction || pendingAction.userId !== request.userId) {
      return this.refuseApproval(decision, "That approval does not match a pending goal allocation.");
    }

    const trustedDecision = pendingAction.decision;
    const toolCall = trustedDecision.toolCall;
    const allocation = trustedDecision.goalAllocation;
    if (
      !toolCall ||
      toolCall.name !== "createSavingsGoalAllocation" ||
      allocation?.status !== "pending"
    ) {
      return this.refuseApproval(decision, "There is no goal allocation waiting for approval.");
    }

    const policyDecision = canCallTool(request, toolCall);
    if (!policyDecision.allowed) {
      return this.refuseApproval(
        trustedDecision,
        policyDecision.reason ?? "That action needs approval first."
      );
    }

    const approval = {
      id: `goal_approval_${this.nextGoalApprovalNumber++}`,
      actionId,
      approvedAt: new Date().toISOString(),
      source: "user_message" as const
    };
    let recordedAllocation: SavingsGoalAllocation;
    try {
      recordedAllocation = await this.dependencies.tools.createSavingsGoalAllocation({
        userId: request.userId,
        savingsEntryId: allocation.savingsEntryId,
        amountCents: allocation.amountCents,
        goalName: allocation.goalName,
        approval,
        approvedActionId: actionId
      });
    } catch {
      const message = "I couldn't confirm whether the goal allocation was recorded. You can say yes to safely retry the same approved allocation. No real money has moved yet.";
      return {
        message,
        decision: {
          ...trustedDecision,
          action: "ask_follow_up",
          userFacingMessage: message
        }
      };
    }

    this.pendingGoalAllocationActions.delete(actionId);
    this.pendingGoalAllocationIdsByConversation.delete(pendingAction.conversationKey);
    const recentEntry = this.recentSavingsEntriesByConversation.get(pendingAction.conversationKey);
    if (recentEntry?.id === allocation.savingsEntryId) {
      this.recentSavingsEntriesByConversation.delete(pendingAction.conversationKey);
    }

    const message = `Done. I linked the recorded ${formatUsd(recordedAllocation.amountCents)} entry to ${recordedAllocation.goalName} in your mocked Victoria savings ledger. No real money has moved yet.`;
    return {
      message,
      decision: {
        ...trustedDecision,
        action: "record_goal_allocation",
        goalAllocation: recordedAllocation,
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

  private async composeWithVoice(response: AgentResponse, correlationId: string): Promise<AgentResponse> {
    const voice = this.dependencies.voice ?? this.dependencies.specialists?.voice;
    if (!voice) return response;

    const outcome: VerifiedResponseOutcome = {
      action: response.decision.action,
      financialEventType: response.decision.classification.type,
      ...(response.decision.suggestion
        ? {
            amountCents: response.decision.suggestion.amountCents,
            amountSource: response.decision.suggestion.source,
            movementMode: response.decision.suggestion.movementMode
          }
        : response.decision.goalAllocation
        ? {
            amountCents: response.decision.goalAllocation.amountCents,
            ...(response.decision.toolCall?.movementMode
              ? { movementMode: response.decision.toolCall.movementMode }
              : {})
          }
        : response.decision.proposal
        ? {
            amountCents: response.decision.proposal.suggestion.amountCents,
            amountSource: response.decision.proposal.suggestion.source,
            movementMode: response.decision.proposal.suggestion.movementMode
          }
        : response.decision.classification.amountCents !== undefined
        ? { amountCents: response.decision.classification.amountCents }
        : {}),
      ...(response.decision.proposal ? { proposalStatus: response.decision.proposal.status } : {}),
      ...(response.decision.goalAllocation
        ? { goalName: response.decision.goalAllocation.goalName }
        : response.decision.proposal?.goalName
        ? { goalName: response.decision.proposal.goalName }
        : {}),
      ledgerEntryRecorded: response.decision.action === "create_ledger_entry" ||
        response.decision.action === "record_goal_allocation"
    };

    const controller = new AbortController();
    const startedAt = new Date();
    const start = performance.now();
    let status: "succeeded" | "failed" | "timed_out" | "invalid_output" = "failed";
    let timeout: ReturnType<typeof setTimeout> | undefined;
    try {
      const handoff = CompanionVoiceInputSchema.parse({
        schemaVersion: HANDOFF_SCHEMA_VERSION,
        outcome,
        responseGoal: response.message
      });
      const rawOutput = await Promise.race([
        voice.compose({ handoff, signal: controller.signal }),
        new Promise<unknown>((_, reject) => {
          timeout = setTimeout(() => {
            controller.abort();
            reject(new CompanionVoiceTimeoutError());
          }, 5_000);
        })
      ]);
      const parsedOutput = CompanionVoiceOutputSchema.safeParse(rawOutput);
      if (!parsedOutput.success) {
        status = "invalid_output";
        return response;
      }
      const draft = parsedOutput.data.draft;
      if (!isSafeCompanionVoiceDraft(draft, response.message)) {
        status = "invalid_output";
        return response;
      }
      status = "succeeded";
      return {
        ...response,
        message: draft,
        decision: { ...response.decision, userFacingMessage: draft }
      };
    } catch (error) {
      if (error instanceof CompanionVoiceTimeoutError) status = "timed_out";
      return response;
    } finally {
      if (timeout !== undefined) clearTimeout(timeout);
      this.recordTrace(createSpecialistTrace({
        correlationId,
        role: "companion_voice",
        status,
        startedAt: startedAt.toISOString(),
        completedAt: new Date().toISOString(),
        durationMs: Math.max(0, Math.round(performance.now() - start))
      }));
    }
  }

  private recordTrace(trace: SpecialistHandoffTrace): void {
    this.traceBuffer.record(trace);
    recordTraceSafely(this.dependencies.traceSink, trace);
  }
}

class CompanionVoiceTimeoutError extends Error {}
