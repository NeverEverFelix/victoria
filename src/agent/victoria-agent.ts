import type { LlmAdapter } from "./llm/types.js";
import type { MemoryProvider } from "./memory/types.js";
import type { AgentTeamSpecialists, SavingsAssessment } from "./team-prototype.js";
import {
  clarificationAfterSpecialistFailure,
  fallbackFinding,
  validateTeamAssessment,
  validateTeamFinding
} from "./team-assessment-policy.js";
import { finalizeCompanionResponse, requiredDisclosures } from "./team-response-policy.js";
import { canCallTool, interpretApprovalResponse } from "./policy.js";
import { validateClassifiedMessage, validateSavingsSuggestion } from "./validation.js";
import { applyClassificationConfidencePolicy } from "./confidence-policy.js";
import { transitionSavingsProposal } from "../domain/savings/proposal-lifecycle.js";
import type { VictoriaTools } from "./tools/contracts.js";
import { formatUsd } from "../domain/money.js";
import { immutableSnapshot } from "../domain/immutable.js";
import type {
  PendingSavingsGoalAllocation,
  SavingsEntry,
  SavingsGoalAllocation,
  SavingsApproval
} from "../domain/savings/types.js";
import type {
  AgentDecision,
  AgentRequest,
  AgentResponse,
  ClassifiedMessage,
  SavingsEvent,
  SavingsProposal,
  SavingsSuggestion,
  PendingSavingsEntryCorrection
} from "./types.js";

export interface VictoriaAgentDependencies {
  llm: LlmAdapter;
  memory: MemoryProvider;
  tools: VictoriaTools;
  /** Optional specialist advisory stack; core workflow and all mutations stay deterministic. */
  specialists?: AgentTeamSpecialists;
}

interface TeamAdvice {
  assessment: SavingsAssessment;
  message: string;
}

export class VictoriaAgent {
  private readonly pendingSavingsActions = new Map<
    string,
    { userId: string; conversationKey: string; decision: AgentDecision; awaitingValidRevision?: boolean; approval?: SavingsApproval }
  >();
  private readonly pendingActionIdsByConversation = new Map<string, string>();
  private readonly pendingGoalAllocationActions = new Map<
    string,
    { userId: string; conversationKey: string; decision: AgentDecision; approval?: SavingsGoalAllocation["approval"] }
  >();
  private readonly pendingGoalAllocationIdsByConversation = new Map<string, string>();
  private readonly pendingEntryCorrections = new Map<string, { userId: string; conversationKey: string; decision: AgentDecision; approvalId?: string }>();
  private readonly pendingEntryCorrectionIdsByConversation = new Map<string, string>();
  private readonly recentSavingsEntriesByConversation = new Map<string, SavingsEntry>();
  private readonly pendingAmountClarifications = new Map<
    string,
    { userId: string; classification: ClassifiedMessage; savingsEvent: SavingsEvent }
  >();
  private readonly pendingIntentClarifications = new Map<string, { messages: readonly string[] }>();
  private nextActionNumber = 1;
  private nextEventNumber = 1;
  private nextProposalNumber = 1;
  private nextApprovalNumber = 1;
  private nextGoalAllocationNumber = 1;
  private nextGoalApprovalNumber = 1;
  private nextProposalTransitionNumber = 1;

  constructor(private readonly dependencies: VictoriaAgentDependencies) {}

  async respond(request: AgentRequest): Promise<AgentResponse> {
    return immutableSnapshot(await this.respondTurn(request));
  }

  private async respondTurn(request: AgentRequest): Promise<AgentResponse> {
    const conversationKey = this.conversationKey(request);
    const pendingCorrectionId = this.pendingEntryCorrectionIdsByConversation.get(conversationKey);
    const pendingCorrection = pendingCorrectionId
      ? this.pendingEntryCorrections.get(pendingCorrectionId)
      : undefined;
    if (pendingCorrection && pendingCorrectionId) {
      const approval = interpretApprovalResponse(request.message, pendingCorrection.decision.entryCorrection?.correctedAmountCents);
      if (approval === "explicit_approval") {
        return this.approveEntryCorrection({ ...request, approvedActionId: pendingCorrectionId }, pendingCorrection.decision);
      }
      if (approval === "explicit_decline") {
        this.pendingEntryCorrections.delete(pendingCorrectionId);
        this.pendingEntryCorrectionIdsByConversation.delete(conversationKey);
        const message = "No problem. The recorded savings entry remains unchanged.";
        return { message, decision: { ...pendingCorrection.decision, action: "reflect", userFacingMessage: message } };
      }
      if (approval === "ambiguous") {
        const message = "Please give me a clear yes or no before I correct this ledger entry.";
        return { message, decision: { ...pendingCorrection.decision, action: "ask_follow_up", userFacingMessage: message } };
      }
      const message = "A savings correction is still waiting for your clear yes or no. The recorded entry has not changed.";
      return { message, decision: { ...pendingCorrection.decision, action: "ask_follow_up", userFacingMessage: message } };
    }
    const pendingGoalActionId = this.pendingGoalAllocationIdsByConversation.get(conversationKey);
    const pendingGoalAction = pendingGoalActionId
      ? this.pendingGoalAllocationActions.get(pendingGoalActionId)
      : undefined;

    if (pendingGoalAction && pendingGoalActionId) {
      const approvalResponse = interpretApprovalResponse(request.message, pendingGoalAction.decision.goalAllocation?.amountCents);
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
      const approvalResponse = interpretApprovalResponse(request.message, pendingAction.decision.suggestion?.amountCents);

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
        let declinedProposal: SavingsProposal | undefined;
        let proposalTransitions = pendingAction.decision.proposalTransitions ?? [];
        if (actionId && proposal?.status === "pending") {
          const transition = transitionSavingsProposal(proposal, {
            id: `proposal_transition_${this.nextProposalTransitionNumber++}`,
            userId: request.userId,
            actionId,
            createdAt: new Date().toISOString(),
            to: "declined"
          });
          declinedProposal = transition.proposal;
          proposalTransitions = [...proposalTransitions, transition.transition];
        }

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
            ...(proposalTransitions.length ? { proposalTransitions } : {}),
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
    const pendingIntentContext = this.pendingIntentClarifications.get(conversationKey);
    const classificationMessages = [...(pendingIntentContext?.messages ?? []), request.message].slice(-4);
    const { classification, teamAdvice } = await this.classifyWithTeam(
      request.message, memory, pendingIntentContext?.messages ?? []
    );
    if (classification.type === "unclear") {
      this.pendingIntentClarifications.set(conversationKey, { messages: classificationMessages });
    } else {
      this.pendingIntentClarifications.delete(conversationKey);
    }

    if (classification.type === "real_money_movement_request") {
      const pendingAmountCents = pendingAction?.decision.suggestion?.amountCents;
      const pendingGoalAllocation = pendingGoalAction?.decision.goalAllocation;
      const pendingAmount = pendingGoalAllocation?.status === "pending"
        ? pendingGoalAllocation.amountCents
        : pendingAmountCents;
      const coreMessage = pendingGoalAllocation?.status === "pending"
        ? `I can't move real money in the Victoria MVP. I can record the ${formatUsd(pendingGoalAllocation.amountCents)} goal allocation toward ${pendingGoalAllocation.goalName} in the mocked Victoria savings ledger after you explicitly confirm. No transfer has been made.`
        : pendingAmount === undefined
        ? "I can't move real money in the Victoria MVP. I can only record savings in the mocked Victoria savings ledger after we identify an amount and you explicitly confirm. No transfer has been made."
        : `I can't move real money in the Victoria MVP. I can record ${formatUsd(pendingAmount)} in the mocked Victoria savings ledger after you confirm. No transfer has been made.`;
      const message = teamAdvice?.message ?? coreMessage;

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
      const message = classification.type === "unclear" && classification.uncertainIntent === "goal_allocation"
        ? "I couldn't confidently understand a change to the pending goal allocation. It remains unchanged; please confirm or decline it before requesting a different goal."
        : "Please confirm or decline linking this savings entry to the goal.";
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
      const message = classification.type === "unclear" && classification.uncertainIntent === "proposal_revision"
        ? amountCents === undefined
          ? "I couldn't confidently understand that revision. The current suggestion is unchanged and still pending. Please state a clear amount or reason change, or confirm or decline the current suggestion."
          : `I couldn't confidently understand that revision. The ${formatUsd(amountCents)} suggestion is unchanged and still pending. Please state a clear amount or reason change, or confirm or decline it.`
        : amountCents === undefined
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

    if (classification.type === "entry_correction") {
      const recentEntry = this.recentSavingsEntriesByConversation.get(conversationKey);
      if (!recentEntry || recentEntry.userId !== request.userId) {
        const message = "Which recorded savings entry would you like to correct? I can only match an entry from this conversation.";
        return { message, decision: { action: "ask_follow_up", classification, userFacingMessage: message } };
      }
      if (classification.amountIssue || classification.amountCents === undefined) {
        const message = classification.amountIssue
          ? "Please give one positive USD amount with no more than two decimal places. The recorded entry is unchanged."
          : "What should the corrected amount be in USD? The recorded entry is unchanged until you confirm.";
        return { message, decision: { action: "ask_follow_up", classification, userFacingMessage: message } };
      }
      const currentAmount = await this.dependencies.tools.getEffectiveSavingsEntryAmount(request.userId, recentEntry.id);
      if (currentAmount === null) {
        const message = "I couldn't find that completed mocked ledger entry, so it has not been changed.";
        return { message, decision: { action: "ask_follow_up", classification, userFacingMessage: message } };
      }
      if (classification.amountCents === currentAmount) {
        const message = `That entry is already recorded as ${formatUsd(currentAmount)}. It remains unchanged.`;
        return { message, decision: { action: "reflect", classification, userFacingMessage: message } };
      }
      const actionId = `entry_correction_action_${this.nextActionNumber++}`;
      const correction: PendingSavingsEntryCorrection = {
        id: `entry_correction_proposal_${this.nextActionNumber - 1}`,
        userId: request.userId,
        savingsEntryId: recentEntry.id,
        correctedAmountCents: classification.amountCents,
        adjustmentCents: classification.amountCents - currentAmount,
        reason: classification.revisionReason ?? "User corrected the recorded savings amount.",
        status: "pending",
        createdAt: new Date().toISOString()
      };
      const deltaText = correction.adjustmentCents > 0
        ? `increase the recorded amount by ${formatUsd(correction.adjustmentCents)}`
        : `reduce the recorded amount by ${formatUsd(-correction.adjustmentCents)}`;
      const message = `The most recently recorded entry in this conversation is currently ${formatUsd(currentAmount)}. I can ${deltaText}, making the corrected total ${formatUsd(correction.correctedAmountCents)} in your mocked Victoria savings ledger. The original entry will stay in the history. Please confirm this correction. No real money has moved.`;
      const decision: AgentDecision = {
        action: "correct_ledger_entry", classification, entryCorrection: correction,
        toolCall: { name: "createSavingsEntryCorrection", actionId, arguments: { savingsEntryId: recentEntry.id, correctedAmountCents: correction.correctedAmountCents, reason: correction.reason }, requiresApproval: true },
        userFacingMessage: message
      };
      this.pendingEntryCorrections.set(actionId, { userId: request.userId, conversationKey, decision });
      this.pendingEntryCorrectionIdsByConversation.set(conversationKey, actionId);
      return { message, decision };
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

    const decision = await this.decide(request, resolvedClassification, resolvedSavingsEvent, teamAdvice);
    const userFacingMessage = this.teamMessageForDecision(decision, teamAdvice);

    return {
      message: userFacingMessage,
      decision: userFacingMessage === decision.userFacingMessage
        ? decision
        : { ...decision, userFacingMessage }
    };
  }

  private async classifyWithTeam(
    message: string,
    memory: Awaited<ReturnType<MemoryProvider["getMemoryForUser"]>>,
    conversationContext: readonly string[] = []
  ): Promise<{
    classification: ClassifiedMessage;
    teamAdvice?: TeamAdvice;
  }> {
    const specialists = this.dependencies.specialists;
    if (!specialists) {
      const candidate = await this.dependencies.llm.classifyMessage({ userMessage: message, memory, conversationContext });
      const classification = validateClassifiedMessage(candidate) ?? fallbackFinding(message).classification;
      return { classification: applyClassificationConfidencePolicy(classification) };
    }

    let finding;
    let financialMomentValid = false;
    try {
      const candidate = await specialists.financialMoment.analyze({ message, memory, conversationContext });
      const validated = validateTeamFinding(candidate);
      finding = validated ?? fallbackFinding(message);
      financialMomentValid = validated !== null;
    } catch {
      finding = fallbackFinding(message);
    }
    const classification = applyClassificationConfidencePolicy(finding.classification);
    finding = { classification };
    if (!financialMomentValid || !isTeamSupportedClassification(classification)) return { classification };

    let assessment: SavingsAssessment;
    try {
      const candidate = await specialists.savingsReasoning.assess({ finding, memory });
      assessment = validateTeamAssessment(candidate, finding, memory);
    } catch {
      assessment = clarificationAfterSpecialistFailure("savingsReasoning");
    }
    // Keep the clarification selected by Savings Reasoning intact. Companion
    // Voice is reserved for suggestion and reflection wording.
    if (assessment.outcome === "ask") {
      return { classification, teamAdvice: { assessment, message: assessment.question } };
    }
    const disclosures = requiredDisclosures(finding, assessment);
    let draft: unknown;
    try {
      draft = await specialists.companionVoice.respond({ finding, assessment, requiredDisclosures: disclosures });
    } catch {
      draft = undefined;
    }
    return {
      classification,
      teamAdvice: { assessment, message: finalizeCompanionResponse(draft, finding, assessment).message }
    };
  }

  private teamMessageForDecision(decision: AgentDecision, teamAdvice?: TeamAdvice): string {
    if (!teamAdvice) return decision.userFacingMessage;
    const type = decision.classification.type;
    if (type === "unclear" && teamAdvice.assessment.outcome === "ask") return teamAdvice.message;
    if (type === "regretful_spend" && teamAdvice.assessment.outcome === "reflect") return teamAdvice.message;
    if (type === "avoided_spend") {
      if (decision.action === "suggest_savings" && teamAdvice.assessment.outcome === "suggest" &&
          decision.suggestion?.amountCents === teamAdvice.assessment.amountCents) return teamAdvice.message;
      if (decision.action === "ask_follow_up" && teamAdvice.assessment.outcome === "ask") return teamAdvice.message;
    }
    return decision.userFacingMessage;
  }

  private async decide(
    request: AgentRequest,
    classification: ClassifiedMessage,
    savingsEvent?: SavingsEvent,
    teamAdvice?: TeamAdvice
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
      const amountClarification = classification.uncertainIntent === "goal_allocation"
        ? "I may have misunderstood the goal request. Which saved amount and goal should I link? Nothing has changed."
        : classification.uncertainIntent === "proposal_revision"
        ? "I may have misunderstood the requested revision. Which amount or reason should I change? The current proposal is unchanged."
        : classification.uncertainIntent === "entry_correction"
        ? "I may have misunderstood the correction. Which recorded amount should I correct to? The ledger entry is unchanged."
        : classification.amountIssue === "invalid_value"
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
      return this.suggestSavings(request, classification, savingsEvent, teamAdvice);
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
    teamAdvice?: TeamAdvice
  ): Promise<AgentDecision> {
    const savingsEvent = existingSavingsEvent ?? this.buildSavingsEvent(request, classification);
    this.recentSavingsEntriesByConversation.delete(this.conversationKey(request));
    const suggestion = await this.dependencies.tools.estimateAvoidedSpend({
      userId: request.userId,
      ...(classification.merchantName ? { merchantName: classification.merchantName } : {}),
      ...(classification.amountCents !== undefined
        ? { userProvidedAmountCents: classification.amountCents }
        : {})
    });

    if (!suggestion || !validateSavingsSuggestion(suggestion)) {
      this.pendingAmountClarifications.set(this.conversationKey(request), {
        userId: request.userId,
        classification,
        savingsEvent
      });

      return {
        action: "ask_follow_up",
        classification,
        savingsEvent,
        userFacingMessage: suggestion
          ? "I couldn't verify a valid positive USD estimate. About how much would you have spent if you had gone through with it?"
          : "Nice choice. About how much would you have spent if you had gone through with it?"
      };
    }

    if (teamAdvice) {
      const assessment = teamAdvice.assessment;
      const expectedSource = suggestion.source === "user_provided" ? "user_provided" : "habit_estimate";
      const agreesWithDeterministicEstimate = assessment.outcome === "suggest" &&
        assessment.amountCents === suggestion.amountCents && assessment.source === expectedSource;
      if (!agreesWithDeterministicEstimate) {
        this.pendingAmountClarifications.set(this.conversationKey(request), {
          userId: request.userId,
          classification,
          savingsEvent
        });
        return {
          action: "ask_follow_up",
          classification,
          savingsEvent,
          userFacingMessage: assessment.outcome === "ask"
            ? teamAdvice.message
            : "I couldn't confirm an amount that matches your details. About how much would you have spent if you had gone through with it?"
        };
      }
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
      actionId: nextActionId,
      supersedesProposalId: proposal.id,
      goalName,
      createdAt: new Date().toISOString()
    };
    const updatedDecision: AgentDecision = {
      ...pendingDecision,
      action: "update_goal",
      classification,
      proposal: updatedProposal,
      proposalTransitions: [
        ...(pendingDecision.proposalTransitions ?? []),
        transitionSavingsProposal(proposal, {
          id: `proposal_transition_${this.nextProposalTransitionNumber++}`,
          userId: request.userId,
          actionId: previousActionId,
          createdAt: new Date().toISOString(),
          to: "superseded",
          supersededByProposalId: updatedProposal.id
        }).transition
      ],
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
    const superseded = transitionSavingsProposal(previousProposal, {
      id: `proposal_transition_${this.nextProposalTransitionNumber++}`,
      userId: request.userId,
      actionId: previousActionId,
      createdAt: new Date().toISOString(),
      to: "superseded",
      supersededByProposalId: linkedProposal.id
    });
    const revisedDecision: AgentDecision = {
      ...nextDecision,
      proposal: linkedProposal,
      proposalTransitions: [
        ...(pendingDecision.proposalTransitions ?? []),
        superseded.transition
      ],
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

  private async proposeGoalAllocation(
    request: AgentRequest,
    classification: ClassifiedMessage,
    entry: SavingsEntry
  ): Promise<AgentResponse> {
    let effectiveAmountCents: number | null;
    try {
      effectiveAmountCents = await this.dependencies.tools.getEffectiveSavingsEntryAmount(request.userId, entry.id);
    } catch {
      effectiveAmountCents = null;
    }
    if (effectiveAmountCents === null) {
      const message = "I couldn't verify the current amount for that saved entry, so I haven't linked it to a goal.";
      return { message, decision: { action: "ask_follow_up", classification, userFacingMessage: message } };
    }
    const actionId = `goal_allocation_action_${this.nextGoalAllocationNumber++}`;
    const goalAllocation: PendingSavingsGoalAllocation = {
      id: `goal_allocation_proposal_${this.nextGoalAllocationNumber - 1}`,
      userId: request.userId,
      savingsEntryId: entry.id,
      amountCents: effectiveAmountCents,
      goalName: classification.goalName ?? "",
      status: "pending",
      createdAt: new Date().toISOString()
    };
    const message = `I can link the currently recorded ${formatUsd(effectiveAmountCents)} entry to ${goalAllocation.goalName} in your mocked savings ledger. Please confirm this goal allocation. No real money has moved yet.`;
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
          amountCents: effectiveAmountCents,
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
      actionId,
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
        : suggestion.source === "merchant_history" && classification.merchantName
        ? `Based on your usual spend at ${classification.merchantName}, I estimate you avoided spending ${dollars}. Would you like me to record that`
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
    return immutableSnapshot(await this.approveToolCallInternal(request, decision));
  }

  private async approveToolCallInternal(request: AgentRequest, decision: AgentDecision): Promise<AgentResponse> {
    if (decision.toolCall?.name === "createSavingsEntryCorrection") {
      return this.approveEntryCorrection(request, decision);
    }
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

    const approval = pendingAction?.approval ?? {
      id: `approval_${this.nextApprovalNumber++}`,
      proposalId: trustedProposal.id,
      userId: request.userId,
      actionId: approvedActionIdForEntry,
      source: "user_message" as const,
      approvedAt: new Date().toISOString()
    };
    if (pendingAction && !pendingAction.approval) {
      this.pendingSavingsActions.set(approvedActionIdForEntry, { ...pendingAction, approval });
    }
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
    const recorded = transitionSavingsProposal(trustedProposal, {
      id: `proposal_transition_${this.nextProposalTransitionNumber++}`,
      userId: request.userId,
      actionId: approvedActionIdForEntry,
      createdAt: entry.createdAt,
      to: "recorded",
      approval,
      ledgerEntryId: entry.id,
      recordedAt: entry.createdAt
    });

    return {
      message,
      decision: {
        ...trustedDecision,
        action: "create_ledger_entry",
        proposal: recorded.proposal,
        proposalTransitions: [
          ...(trustedDecision.proposalTransitions ?? []),
          recorded.transition
        ],
        userFacingMessage: message
      }
    };
  }

  private async approveEntryCorrection(request: AgentRequest, decision: AgentDecision): Promise<AgentResponse> {
    const actionId = request.approvedActionId;
    const pending = actionId ? this.pendingEntryCorrections.get(actionId) : undefined;
    if (!actionId || !pending || pending.userId !== request.userId) {
      return this.refuseApproval(decision, "That approval does not match a pending savings correction.");
    }
    const trusted = pending.decision;
    const correction = trusted.entryCorrection;
    const toolCall = trusted.toolCall;
    if (!correction || !("status" in correction) || correction.status !== "pending" || !toolCall || toolCall.actionId !== actionId) {
      return this.refuseApproval(trusted, "There is no savings correction waiting for approval.");
    }
    const policy = canCallTool(request, toolCall);
    if (!policy.allowed) return this.refuseApproval(trusted, policy.reason ?? "That correction needs approval first.");
    let approvalId = pending.approvalId;
    if (!approvalId) {
      approvalId = `approval_${this.nextApprovalNumber++}`;
      this.pendingEntryCorrections.set(actionId, { ...pending, approvalId });
    }
    try {
      const recorded = await this.dependencies.tools.createSavingsEntryCorrection({
        userId: request.userId,
        savingsEntryId: correction.savingsEntryId,
        correctedAmountCents: correction.correctedAmountCents,
        reason: correction.reason,
        approvalId,
        approvedActionId: actionId
      });
      this.pendingEntryCorrections.delete(actionId);
      this.pendingEntryCorrectionIdsByConversation.delete(pending.conversationKey);
      const weekly = await this.dependencies.tools.getWeeklySavingsTotal(request.userId).catch(() => null);
      const progress = weekly === null ? " I couldn't load your weekly total just now." :
        ` Your total in the mocked Victoria savings ledger this week is ${formatUsd(weekly)}.`;
      const message = `Done. I corrected the recorded amount to ${formatUsd(recorded.correctedAmountCents)}. The original entry remains in the history with this linked adjustment.${progress} No real money has moved.`;
      return { message, decision: { ...trusted, action: "correct_ledger_entry", entryCorrection: recorded, userFacingMessage: message } };
    } catch {
      const message = "I couldn't confirm whether the correction was recorded, so the action remains pending. You can say yes to safely retry the same correction. No real money has moved.";
      return { message, decision: { ...trusted, action: "ask_follow_up", userFacingMessage: message } };
    }
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

    let currentEffectiveAmount: number | null;
    try {
      currentEffectiveAmount = await this.dependencies.tools.getEffectiveSavingsEntryAmount(
        request.userId,
        allocation.savingsEntryId
      );
    } catch {
      const message = "I couldn't verify the saved amount just now, so I haven't linked it to the goal. Please say yes to try again.";
      return {
        message,
        decision: { ...trustedDecision, action: "ask_follow_up", userFacingMessage: message }
      };
    }
    if (currentEffectiveAmount === null) {
      this.pendingGoalAllocationActions.delete(actionId);
      this.pendingGoalAllocationIdsByConversation.delete(pendingAction.conversationKey);
      const message = "I couldn't find that saved entry, so I haven't linked it to the goal.";
      return {
        message,
        decision: { ...trustedDecision, action: "ask_follow_up", userFacingMessage: message }
      };
    }
    if (currentEffectiveAmount !== allocation.amountCents) {
      const replacementActionId = `goal_allocation_action_${this.nextGoalAllocationNumber++}`;
      const replacementAllocation: PendingSavingsGoalAllocation = {
        ...allocation,
        id: `goal_allocation_proposal_${this.nextGoalAllocationNumber - 1}`,
        amountCents: currentEffectiveAmount,
        createdAt: new Date().toISOString()
      };
      const message = `The saved amount changed to ${formatUsd(currentEffectiveAmount)} after that proposal. I haven't linked anything. I can link the current amount to ${allocation.goalName}; please confirm again.`;
      const replacementDecision: AgentDecision = {
        ...trustedDecision,
        action: "update_goal",
        goalAllocation: replacementAllocation,
        toolCall: {
          ...toolCall,
          actionId: replacementActionId,
          arguments: { ...toolCall.arguments, amountCents: currentEffectiveAmount }
        },
        userFacingMessage: message
      };
      this.pendingGoalAllocationActions.delete(actionId);
      this.pendingGoalAllocationActions.set(replacementActionId, {
        userId: request.userId,
        conversationKey: pendingAction.conversationKey,
        decision: replacementDecision
      });
      this.pendingGoalAllocationIdsByConversation.set(pendingAction.conversationKey, replacementActionId);
      return { message, decision: replacementDecision };
    }

    const approval = pendingAction.approval ?? {
      id: `goal_approval_${this.nextGoalApprovalNumber++}`,
      actionId,
      approvedAt: new Date().toISOString(),
      source: "user_message" as const
    };
    if (!pendingAction.approval) {
      this.pendingGoalAllocationActions.set(actionId, { ...pendingAction, approval });
    }
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
}

function isTeamSupportedClassification(classification: ClassifiedMessage): boolean {
  if (classification.type === "avoided_spend" || classification.type === "regretful_spend") return true;
  if (classification.type === "unclear" && classification.uncertainIntent) return false;
  // A bare unclear message can benefit from specialist clarification. When an
  // amount is present, let the core clarification-resolution path handle it.
  return classification.type === "unclear" && classification.amountCents === undefined;
}
