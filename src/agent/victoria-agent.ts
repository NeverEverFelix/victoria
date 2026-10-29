import { createHash } from "node:crypto";
import type { LlmAdapter } from "./llm/types.js";
import type { ConversationalMemory, MemoryProvider } from "./memory/types.js";
import { MemoryOrchestrator } from "./memory/memory-orchestrator.js";
import type { AgentTeamSpecialists, SavingsAssessment } from "./team-prototype.js";
import { composeTeamDecisionMessage, type TeamAdvice } from "./response-composition.js";
import {
  clarificationAfterSpecialistFailure,
  fallbackFinding,
  groundExplicitAvoidedSpendAmount,
  validateTeamAssessment,
  validateTeamFinding
} from "./team-assessment-policy.js";
import { finalizeCompanionResponse, requiredDisclosures, voiceDraftRevisionFeedback, type VoiceDraftIssue } from "./team-response-policy.js";
import { canCallTool, interpretApprovalResponse } from "./policy.js";
import { validateClassifiedMessage, validateSavingsSuggestion } from "./validation.js";
import { applyClassificationConfidencePolicy } from "./confidence-policy.js";
import { clarificationMessage } from "./clarification-policy.js";
import {
  getAllocationTargetChoiceFromConversation,
  isAnswerToRecentVictoriaQuestion,
  isCoveredAllocationTargetChoice,
  recoverPendingPlanningHorizon,
  resolveCoveredSpendPeriodAnswer
} from "./conversation-dialogue-policy.js";
import { transitionSavingsProposal } from "../domain/savings/proposal-lifecycle.js";
import type { VictoriaTools } from "./tools/contracts.js";
import { annualizeMonthlyAmountCents, formatUsd } from "../domain/money.js";
import { parseExplicitDollarAmount } from "../domain/financial-events/parse-explicit-amount.js";
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
import { DEFAULT_CONVERSATION_CONTEXT_LIMIT } from "./memory/types.js";
import {
  extractConversationalMemory,
  extractConversationalMemories,
  extractConversationalSpendCorrection,
  extractMerchantSpendClaim,
  merchantHabitMemoryKey,
  merchantSpendMemoryKey
} from "./memory/extract-preference.js";
import { selectFinancialContextSource } from "./context-source-policy.js";
import { buildTurnContext, projectionFromResolvedReferences } from "./turn-context.js";
import type { TurnContext } from "./turn-context.js";
import { resolvePlanningReference } from "./planning-reference-resolver.js";
import {
  buildActiveSavingsConversationState,
  buildAwaitingAmountConversationState,
  revisePlanningState,
  selectConversationWorkflowState
} from "./conversation-state-manager.js";
import { buildVictoriaConversationContext, resolveFinancialReferenceHint } from "./conversation-context-builder.js";
import type { ResolvedFinancialReference, VictoriaConversationContext } from "./conversation-context-builder.js";
import { isRetrievableMemory, planMemoryRetrieval } from "./memory/retrieval-planner.js";
import { isMemoryLearningEligibleTurn } from "./memory/memory-learning-policy.js";
import type { ContextReferenceResolver } from "./context-reference-resolver.js";
import { buildConversationContextSnapshot, validateConversationReply, type ConversationContextSnapshot, type ConversationResponder, type ConversationResponderInput, type ConversationResponderMemory } from "./conversation-responder.js";
import { deterministicConversationFallback } from "./conversation-fallback.js";
import {
  isPendingCorrectionReplacementRequest,
  isPendingGoalRetargetRequest,
  isSafePendingWorkflowTopicSwitch,
  isOrdinaryQuestion,
  independentOrdinaryQuestion,
  shouldRouteToConversationResponder,
  isReadOnlyEventHistoryQuestion
} from "./conversation-routing.js";
import { resolvePendingWorkflowMessage } from "./pending-workflow-policy.js";
import { isUsableTransactionHistoryEstimate, type TransactionHistoryProvider } from "./transaction-history-provider.js";
import { employerCoveredRecurringSpend, freedRecurringSpend, isBudgetingAdviceQuestion, isExplicitRealMoneyMovementRequest, isRealMoneyMovementRequest } from "./money-movement-intent.js";
import { isExplicitInterestCorrectionEvidence, isExplicitUserEvidence, validateMemoryCandidates, type ConversationalMemoryExtractor } from "./memory/conversational-memory-extractor.js";
import { authoritativeEpisodeOutcome, isUsableEpisodicSummary, SEMANTIC_MEMORY_RECALL_MIN_SIMILARITY, suppressLifecycleConflictingEpisodes, validateEpisodicSummary, type AuthoritativeEpisodeOutcome, type EpisodicMemorySummarizer } from "./memory/episodic-summary.js";
import { validatePersonalizedReply, type ConversationalReplyPersonalizer } from "./memory/personalized-reply.js";
import type { PendingAmountClarification, PendingAmountClarificationStore } from "./pending-amount-clarification-store.js";
import type { PendingSavingsActionStore } from "./pending-savings-action-store.js";
import type { PendingGoalAllocationActionStore } from "./pending-goal-allocation-store.js";
import type { PendingEntryCorrectionStore } from "./pending-entry-correction-store.js";
import { InMemoryConversationSavingsEventStore } from "./savings-event-store.js";
import type { ConversationSavingsEventStore } from "./savings-event-store.js";

export interface VictoriaAgentDependencies {
  llm: LlmAdapter;
  memory: MemoryProvider;
  tools: VictoriaTools;
  /** Optional specialist advisory stack; core workflow and all mutations stay deterministic. */
  specialists?: AgentTeamSpecialists;
  transactionHistory?: TransactionHistoryProvider;
  contextReferenceResolver?: ContextReferenceResolver;
  conversationResponder?: ConversationResponder;
  /** Optional model-backed extractor for stable contextual memories from ordinary conversation. */
  conversationalMemoryExtractor?: ConversationalMemoryExtractor;
  /** Receives a provider failure name only; the current turn continues without provider-derived memories. */
  onConversationalMemoryExtractionFailure?: (errorName: string) => void;
  /** Receives an enumerated fallback reason only; no user message or draft content is included. */
  onConversationReplyFallback?: (reason: "provider_error" | "invalid_after_retry") => void;
  /** Receives validation categories only; never includes draft text or user content. */
  onCompanionVoiceValidationFailure?: (issues: readonly VoiceDraftIssue[]) => void;
  /** Optional wording layer for ordinary reflections; deterministic policy keeps action authority. */
  personalizedReplyPersonalizer?: ConversationalReplyPersonalizer;
  episodicMemorySummarizer?: EpisodicMemorySummarizer;
  pendingAmountClarifications?: PendingAmountClarificationStore;
  pendingSavingsActions?: PendingSavingsActionStore;
  pendingGoalAllocationActions?: PendingGoalAllocationActionStore;
  pendingEntryCorrections?: PendingEntryCorrectionStore;
  savingsEvents?: ConversationSavingsEventStore;
  idFactory?: () => string;
}

export class VictoriaAgent {
  private readonly dependencies: VictoriaAgentDependencies;
  private readonly savingsEvents: ConversationSavingsEventStore;
  private readonly pendingSavingsActions = new Map<
    string,
    { userId: string; conversationKey: string; decision: AgentDecision; awaitingValidRevision?: boolean; awaitingRevisionTarget?: boolean; approval?: SavingsApproval }
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
  private nextActionNumber = 1;
  private nextEventNumber = 1;
  private nextProposalNumber = 1;
  private nextApprovalNumber = 1;
  private nextGoalAllocationNumber = 1;
  private nextGoalApprovalNumber = 1;
  private nextProposalTransitionNumber = 1;

  constructor(dependencies: VictoriaAgentDependencies) {
    this.savingsEvents = dependencies.savingsEvents ?? new InMemoryConversationSavingsEventStore();
    this.dependencies = {
      ...dependencies,
      memory: dependencies.memory instanceof MemoryOrchestrator
        ? dependencies.memory
        : new MemoryOrchestrator(dependencies.memory)
    };
  }

  async respond(request: AgentRequest): Promise<AgentResponse> {
    const conversationId = request.conversationId ?? "default";
    await this.restorePendingSavingsAction(request);
    await this.restorePendingGoalAllocationAction(request);
    await this.restorePendingEntryCorrection(request);
    const conversationKey = this.conversationKey(request);
    const priorPendingGoalActionId = this.pendingGoalAllocationIdsByConversation.get(conversationKey);
    const priorPendingGoalDecision = priorPendingGoalActionId
      ? this.pendingGoalAllocationActions.get(priorPendingGoalActionId)?.decision
      : undefined;
    const priorCorrectionId = this.pendingEntryCorrectionIdsByConversation.get(conversationKey);
    const priorCorrection = priorCorrectionId ? this.pendingEntryCorrections.get(priorCorrectionId) : undefined;
    const priorContext = await this.dependencies.memory.getConversationContext(request.userId, conversationId);
    await this.summarizeOverflowingConversation(request.userId, conversationId, priorContext, request.sourceTurnReferences ?? []);
    const withUserMessage = [...priorContext, request.message].slice(-DEFAULT_CONVERSATION_CONTEXT_LIMIT);
    await this.dependencies.memory.setConversationContext(request.userId, conversationId, withUserMessage);
    const response = immutableSnapshot(await this.respondTurn(request, priorContext));
    if (response.decision.savingsEvent) {
      await this.savingsEvents.record({
        conversationId,
        event: response.decision.savingsEvent
      });
    }
    await this.persistPendingSavingsAction(request, response.decision);
    await this.persistPendingGoalAllocationAction(request, response.decision, priorPendingGoalActionId, priorPendingGoalDecision);
    await this.persistPendingEntryCorrection(request, response.decision, priorCorrectionId, priorCorrection?.decision);
    await this.dependencies.memory.setConversationContext(request.userId, conversationId,
      [...withUserMessage, `Victoria: ${response.message}`].slice(-DEFAULT_CONVERSATION_CONTEXT_LIMIT));
    return response;
  }

  /** Saves a grounded summary of a conversation when the client explicitly ends it. */
  async finishConversation(
    userId: string, conversationId: string,
    sourceTurnReferences: readonly { readonly turnId: string; readonly userMessage: string }[] = []
  ): Promise<boolean> {
    if (!userId.trim() || !conversationId.trim()) return false;
    const context = await this.dependencies.memory.getConversationContext(userId, conversationId);
    const outcome = this.recentSavingsEntriesByConversation.get(this.conversationKey({ userId, conversationId, message: "" }));
    return this.summarizeConversation(userId, context, true, outcome ? [outcome] : [], sourceTurnReferences);
  }

  private async summarizeOverflowingConversation(
    userId: string, conversationId: string, context: readonly string[],
    sourceTurnReferences: readonly { readonly turnId: string; readonly userMessage: string }[]
  ): Promise<void> {
    const outcome = this.recentSavingsEntriesByConversation.get(this.conversationKey({ userId, conversationId, message: "" }));
    await this.summarizeConversation(userId, context, false, outcome ? [outcome] : [], sourceTurnReferences);
  }

  private async summarizeConversation(
    userId: string,
    context: readonly string[],
    finishing: boolean,
    entries: readonly SavingsEntry[] = [],
    sourceTurnReferences: readonly { readonly turnId: string; readonly userMessage: string }[] = []
  ): Promise<boolean> {
    const summarizer = this.dependencies.episodicMemorySummarizer;
    if (!summarizer || (!finishing && context.length < DEFAULT_CONVERSATION_CONTEXT_LIMIT)) return false;
    const recentTurns = context.slice(-16);
    const userMessages = recentTurns
      .filter((message) => !/^Victoria:/i.test(message))
      .filter(isEpisodicSummaryEligible)
      .slice(-8);
    if (userMessages.length < 2) return false;
    const selectedUsers = new Set(userMessages);
    let precedingAssistantMessage: string | undefined;
    const turnPairs = recentTurns.flatMap((message) => {
      if (/^Victoria:/i.test(message)) {
        precedingAssistantMessage = message.replace(/^Victoria:\s*/i, "").slice(0, 2_000);
        return [];
      }
      const pair = selectedUsers.has(message) ? [{
        ...(precedingAssistantMessage ? { precedingAssistantMessage } : {}),
        userMessage: message
      }] : [];
      precedingAssistantMessage = undefined;
      return pair;
    }).slice(-8);
    const digest = createHash("sha256").update(userId).update("\0")
      .update(JSON.stringify(turnPairs)).digest("hex").slice(0, 24);
    const key = `episode:${digest}`;
    if ((await this.dependencies.memory.listConversationalMemories(userId)).some((memory) => memory.key === key)) return true;
    try {
      // Only domain-tool results enter the workflow outcome projection. Assistant prose
      // may help interpret a user reply, but is never proof that an entry was recorded.
      const authoritativeOutcomes: AuthoritativeEpisodeOutcome[] = entries
        .filter((entry) => entry.userId === userId)
        .flatMap((entry) => {
          const outcome = authoritativeEpisodeOutcome(entry);
          return outcome ? [outcome] : [];
        });
      const sourceReferences = mapEpisodeSourceTurns(userMessages, sourceTurnReferences);
      const candidate = validateEpisodicSummary(
        await summarizer.summarize({ userMessages, turnPairs }), userMessages, authoritativeOutcomes, sourceReferences
      );
      if (!candidate) return false;
      await this.dependencies.memory.rememberConversationalMemory(userId, {
        ...candidate,
        key
      });
      return true;
    } catch {
      // Episodic summarization is optional and cannot interrupt an ordinary turn.
      return false;
    }
  }

  private async respondTurn(request: AgentRequest, conversationContext: readonly string[]): Promise<AgentResponse> {
    const conversationKey = this.conversationKey(request);
    const turnContext = buildTurnContext({ message: request.message, priorTurns: conversationContext });
    let resolvedProjection: typeof turnContext.annualProjection;
    if (this.dependencies.contextReferenceResolver && turnContext.recurringCosts.length >= 2 &&
        turnContext.annualProjectionRequested &&
        !/^\s*(?:yes|no|nope|nah)\b/i.test(request.message) &&
        !isExplicitRealMoneyMovementRequest(request.message)) {
      try {
        const resolution = await this.dependencies.contextReferenceResolver.resolve({
          message: request.message, recurringCosts: turnContext.recurringCosts
        });
        resolvedProjection = projectionFromResolvedReferences(turnContext, resolution);
      } catch {
        // Reference resolution cannot grant approval or interrupt a safe fallback.
      }
    }
    const annualProjection = resolvedProjection ?? turnContext.annualProjection;
    const answerToRecentQuestion = isAnswerToRecentVictoriaQuestion(conversationContext);
    const scopedAllocationTargetChoice = isCoveredAllocationTargetChoice(request.message, conversationContext);
    let interestSavedThisTurn = false;
    const pendingCorrectionId = this.pendingEntryCorrectionIdsByConversation.get(conversationKey);
    const pendingCorrection = pendingCorrectionId
      ? this.pendingEntryCorrections.get(pendingCorrectionId)
      : undefined;
    if (pendingCorrection && pendingCorrectionId) {
      const messageResolution = resolvePendingWorkflowMessage({
        message: request.message,
        workflow: "entry_correction",
        ...(pendingCorrection.decision.entryCorrection?.correctedAmountCents === undefined ? {} : {
          expectedAmountCents: pendingCorrection.decision.entryCorrection.correctedAmountCents
        })
      });
      if (messageResolution === "explicit_approval") {
        return this.approveEntryCorrection({ ...request, approvedActionId: pendingCorrectionId }, pendingCorrection.decision);
      }
      if (messageResolution === "explicit_decline") {
        this.pendingEntryCorrections.delete(pendingCorrectionId);
        this.pendingEntryCorrectionIdsByConversation.delete(conversationKey);
        const message = "No problem. The recorded savings entry remains unchanged.";
        return { message, decision: { ...pendingCorrection.decision, action: "reflect", userFacingMessage: message } };
      }
      if (messageResolution === "replacement_request") {
        this.pendingEntryCorrections.delete(pendingCorrectionId);
        this.pendingEntryCorrectionIdsByConversation.delete(conversationKey);
        const correctedAmount = pendingCorrection.decision.entryCorrection?.correctedAmountCents;
        const message = `I heard that you want a different correction. I canceled the pending ${correctedAmount === undefined ? "" : `${formatUsd(correctedAmount)} `}correction; the recorded entry is unchanged. Please send the new correction request so I can prepare a fresh confirmation.`;
        return { message, decision: { ...pendingCorrection.decision, action: "ask_follow_up", userFacingMessage: message } };
      }
      if (messageResolution === "ambiguous") {
        const message = "Please give me a clear yes or no before I correct this ledger entry.";
        return { message, decision: { ...pendingCorrection.decision, action: "ask_follow_up", userFacingMessage: message } };
      }
      if (messageResolution === "read_only_topic" && this.dependencies.conversationResponder) {
        await this.learnFromReadOnlyTopicTurn(request);
        return this.respondConversationalTurn(request, conversationContext,
          "I can help think that through. What part would be most useful to start with? The correction remains pending and the entry is unchanged.", "entry_correction");
      }
      const message = "A savings correction is still waiting for your clear yes or no. The recorded entry has not changed.";
      return { message, decision: { ...pendingCorrection.decision, action: "ask_follow_up", userFacingMessage: message } };
    }
    const pendingGoalActionId = this.pendingGoalAllocationIdsByConversation.get(conversationKey);
    const pendingGoalAction = pendingGoalActionId
      ? this.pendingGoalAllocationActions.get(pendingGoalActionId)
      : undefined;

    if (pendingGoalAction && pendingGoalActionId) {
      const messageResolution = resolvePendingWorkflowMessage({
        message: request.message,
        workflow: "goal_allocation",
        ...(pendingGoalAction.decision.goalAllocation?.amountCents === undefined ? {} : {
          expectedAmountCents: pendingGoalAction.decision.goalAllocation.amountCents
        })
      });
      if (messageResolution === "explicit_approval") {
        return this.approveGoalAllocation(
          { ...request, approvedActionId: pendingGoalActionId },
          pendingGoalAction.decision
        );
      }
      if (messageResolution === "explicit_decline") {
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
      if (messageResolution === "replacement_request") {
        this.pendingGoalAllocationActions.delete(pendingGoalActionId);
        this.pendingGoalAllocationIdsByConversation.delete(conversationKey);
        const message = `I heard that you want a different goal. I canceled the pending ${pendingGoalAction.decision.goalAllocation?.goalName ?? "goal"} allocation; nothing has been linked. Please send the new goal request so I can prepare a fresh confirmation.`;
        return { message, decision: {
          action: "ask_follow_up",
          classification: pendingGoalAction.decision.classification,
          userFacingMessage: message
        } };
      }
      if (messageResolution === "ambiguous") {
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
      if (messageResolution === "read_only_topic" && this.dependencies.conversationResponder) {
        await this.learnFromReadOnlyTopicTurn(request);
        return this.respondConversationalTurn(request, conversationContext,
          "I can help think that through. What part would be most useful to start with? The goal allocation remains pending and has not been recorded.", "goal_allocation");
      }
      const message = "A goal allocation is still waiting for your clear yes or no. The entry has not been linked to a different goal.";
      return {
        message,
        decision: {
          action: "ask_follow_up",
          classification: pendingGoalAction.decision.classification,
          userFacingMessage: message
        }
      };
    }

    const pendingActionId = this.pendingActionIdsByConversation.get(conversationKey);
    const pendingAction = pendingActionId
      ? this.pendingSavingsActions.get(pendingActionId)
      : undefined;

    // Durable proposal snapshots are append-only. Recover the scoped planning
    // choice from this conversation when a new server worker restores the
    // original proposal, rather than treating a later “yes” as a new horizon
    // question or relying on process-local state.
    if (pendingAction && pendingActionId) {
      const recoveredDecision = recoverPendingPlanningHorizon(pendingAction.decision, conversationContext);
      if (recoveredDecision !== pendingAction.decision) {
        pendingAction.decision = recoveredDecision;
        this.pendingSavingsActions.set(pendingActionId, pendingAction);
      }
    }

    const pendingSavingsConversationState = pendingAction && pendingActionId
      ? buildActiveSavingsConversationState(pendingActionId, pendingAction.decision, {
          ...(pendingAction.awaitingValidRevision ? { awaitingValidRevision: true } : {}),
          ...(pendingAction.awaitingRevisionTarget ? { awaitingRevisionTarget: true } : {})
        })
      : undefined;

    if (pendingAction && pendingActionId) {
      const approvalResponse = interpretApprovalResponse(request.message, pendingAction.decision.suggestion?.amountCents);

      if (pendingAction.decision.planningChoice && !pendingAction.decision.planningChoice.selectedHorizon &&
          approvalResponse === "explicit_approval") {
        const message = "Which amount would you like to use for planning: monthly or annual? I haven't asked to record a ledger entry yet.";
        return {
          message,
          decision: { ...pendingAction.decision, action: "ask_follow_up", userFacingMessage: message }
        };
      }

      if (
        (pendingAction.awaitingValidRevision || pendingAction.awaitingRevisionTarget) &&
        (approvalResponse === "explicit_approval" || approvalResponse === "ambiguous")
      ) {
        const message = pendingAction.awaitingRevisionTarget
          ? "I couldn't match that change to the active savings suggestion. I can't target an older event from this request. Please decline the current suggestion before starting a separate savings request; nothing has been changed or recorded."
          : "I need a valid USD amount for that correction before asking you to confirm. Please provide one unambiguous amount or decline the pending suggestion.";
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
            id: this.nextId("proposal_transition", this.nextProposalTransitionNumber++),
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

        const planningAnswer = answerRecurringProjectionQuestion(request.message,
          pendingAction.decision.planningChoice?.monthlyAmountCents ??
          [...conversationContext].reverse().map(freedRecurringSpend).find((spend) => spend?.cadence === "month")?.amountCents,
          pendingAction.decision.suggestion?.amountCents);
        if (planningAnswer) {
          const combined = `${message} ${planningAnswer}`;
          return { message: combined, decision: {
            ...pendingAction.decision,
            action: "reflect",
            ...(declinedProposal ? { proposal: declinedProposal } : {}),
            ...(proposalTransitions.length ? { proposalTransitions } : {}),
            userFacingMessage: combined
          } };
        }

        const followUpQuestion = turnContext.followUpAfterDecline ?? questionAfterDecline(request.message);
        if (followUpQuestion) {
          const bufferAnswer = answerBufferQuestion(followUpQuestion, pendingAction.decision.suggestion?.amountCents);
          if (bufferAnswer) {
            const combined = `${message} ${bufferAnswer}`;
            return { message: combined, decision: {
              ...pendingAction.decision, action: "reflect",
              ...(declinedProposal ? { proposal: declinedProposal } : {}),
              ...(proposalTransitions.length ? { proposalTransitions } : {}),
              userFacingMessage: combined
            } };
          }
          let followUp: AgentResponse | undefined;
          if (this.dependencies.personalizedReplyPersonalizer) {
            const followUpMemory = await this.dependencies.memory.getMemoryForUser(
              request.userId, `${followUpQuestion} ${conversationContext.slice(-4).join(" ")}`
            );
            const memories = selectPersonalizationMemories(
              followUpMemory.conversationalMemories ?? [], followUpQuestion, conversationContext
            );
            if (memories.length > 0) {
              try {
                const input = {
                  userMessage: followUpQuestion,
                  baselineReply: "The pending ledger entry was declined. Answer the user's separate question.",
                  memories,
                  conversationContext: [...conversationContext, request.message],
                  revisionFeedback: "The user's refusal has already been acknowledged. Answer the separate question directly without asking again for ledger confirmation.",
                  ...getPriorCoveredSpendProjection(conversationContext)
                };
                let reply = validatePersonalizedReply(
                  await this.dependencies.personalizedReplyPersonalizer.personalize(input), input
                );
                if (!reply) {
                  const revision = {
                    ...input,
                    revisionFeedback: "The prior answer failed validation. Respect the decline, answer the separate question in one natural paragraph, do not offer ledger recording, and avoid investment products or numbered menus."
                  };
                  reply = validatePersonalizedReply(
                    await this.dependencies.personalizedReplyPersonalizer.personalize(revision), revision
                  );
                }
                if (reply) {
                  followUp = {
                    message: reply.message,
                    decision: {
                      action: "reflect",
                      classification: { type: "general_finance", confidence: 1, summary: followUpQuestion, needsClarification: false },
                      userFacingMessage: reply.message
                    }
                  };
                }
              } catch {
                // An optional conversational reply cannot change the decline.
              }
            }
          }
          followUp ??= await this.respondTurn({ ...request, message: followUpQuestion }, conversationContext);
          if ((followUp.decision.action === "reflect" || followUp.decision.action === "ask_follow_up") &&
              !followUp.decision.toolCall) {
            const combined = `${message} ${followUp.message}`;
            return {
              message: combined,
              decision: {
                ...followUp.decision,
                ...(declinedProposal ? { proposal: declinedProposal } : {}),
                ...(proposalTransitions.length ? { proposalTransitions } : {}),
                userFacingMessage: combined
              }
            };
          }
        }

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

      if (approvalResponse === "not_approval" && !pendingAction.awaitingValidRevision &&
          !pendingAction.awaitingRevisionTarget && this.dependencies.conversationResponder &&
          isReadOnlyEventHistoryQuestion(request.message)) {
        const savingsEvents = await this.savingsEvents.list(request.userId, request.conversationId ?? "default");
        const financialContext = buildVictoriaConversationContext({
          priorTurns: conversationContext,
          turnContext,
          message: request.message,
          savingsEvents,
          ...(pendingSavingsConversationState ? { workflowState: pendingSavingsConversationState } : {})
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
        return this.respondConversationalTurn(
          request,
          conversationContext,
          "I can answer from the savings events in this conversation. The pending suggestion remains unchanged and has not been recorded.",
          "savings_entry",
          financialContext.conversationSavingsEvents,
          financialContext
        );
      }

      const choice = pendingAction.decision.planningChoice;
      const planningReference = choice
        ? resolvePlanningReference({ message: request.message, choice })
        : undefined;
      const horizon = planningReference?.kind === "resolved" ? planningReference.period : undefined;
      const planningTransition = revisePlanningState(pendingSavingsConversationState, planningReference);
      if (choice && planningReference?.kind === "resolved" && horizon &&
          (planningTransition.kind === "revised" ||
            (planningTransition.kind === "unchanged" && horizon === "monthly"))) {
        const selectedAmount = planningTransition.state.planningChoice?.selectedAmountCents ?? planningReference.amountCents;
        const message = horizon === "annual"
          ? `Got it: ${formatUsd(selectedAmount)} is the yearly target you'd like to work toward, based on ${formatUsd(choice.monthlyAmountCents)} a month if your gym stays covered. I can start by recording this month's ${formatUsd(choice.monthlyAmountCents)} in your Victoria savings ledger. Say yes to confirm. No real money moves.`
          : `Got it: ${formatUsd(selectedAmount)} is the monthly target. I can record this month's ${formatUsd(choice.monthlyAmountCents)} in your Victoria savings ledger. Say yes to confirm. No real money moves.`;
        const decision = {
          ...pendingAction.decision,
          planningChoice: { ...choice, selectedHorizon: horizon },
          userFacingMessage: message
        };
        this.pendingSavingsActions.set(pendingActionId, { ...pendingAction, decision });
        return { message, decision };
      }

      if (choice && horizon === "annual" && choice.selectedHorizon === "annual" &&
          planningReference?.kind === "resolved") {
        const message = `Right, you're planning around ${formatUsd(choice.annualProjectionCents)} a year. That assumes ${formatUsd(choice.monthlyAmountCents)} stays freed up each month for 12 months. I can record this month's ${formatUsd(choice.monthlyAmountCents)} toward that target after you confirm. Say yes to record it in your Victoria savings ledger; no real money moves.`;
        return { message, decision: {
          ...pendingAction.decision,
          planningChoice: choice,
          action: "ask_follow_up",
          userFacingMessage: message
        } };
      }

      if (choice?.selectedHorizon === "annual" && /\b(?:future target|target for the future|future goal)\b/i.test(request.message)) {
        const message = `Exactly—the ${formatUsd(choice.annualProjectionCents)} is a future yearly target, not money already saved. I can start by recording this month's ${formatUsd(choice.monthlyAmountCents)} toward it. Say yes to confirm; no real money moves.`;
        return { message, decision: { ...pendingAction.decision, action: "ask_follow_up", userFacingMessage: message } };
      }

      if (approvalResponse === "not_approval" && annualProjection?.eventCount === 1 &&
          isCurrentMonthRecordRequest(request.message) &&
          pendingAction.decision.suggestion?.amountCents === annualProjection.monthlyAmountCents) {
        const message = `That would be ${formatUsd(annualProjection.annualAmountCents)} over 12 months if the expense stays out of your budget. The pending mocked ledger suggestion is ${formatUsd(annualProjection.monthlyAmountCents)} for this month. Say yes to confirm recording that amount; no real money moves.`;
        return { message, decision: {
          ...pendingAction.decision,
          action: "ask_follow_up",
          userFacingMessage: message
        } };
      }

      const planningAnswer = answerRecurringProjectionQuestion(request.message,
        pendingAction.decision.planningChoice?.monthlyAmountCents ??
        [...conversationContext].reverse().map(freedRecurringSpend).find((spend) => spend?.cadence === "month")?.amountCents,
        pendingAction.decision.suggestion?.amountCents);
      if (planningAnswer) {
        return { message: planningAnswer, decision: {
          action: "reflect",
          classification: { type: "general_finance", confidence: 1, summary: request.message, needsClarification: false },
          userFacingMessage: planningAnswer
        } };
      }

      if (annualProjection?.eventCount === 2 && isCurrentMonthRecordRequest(request.message)) {
        const message = describeCombinedProjectionAndClarifyRecordTarget(
          annualProjection,
          turnContext.annualProjection?.eventCount === 2 ? turnContext.recurringCosts : undefined,
          pendingAction.decision.suggestion?.amountCents
        );
        return { message, decision: {
          action: "ask_follow_up",
          classification: { type: "unclear", confidence: 1, summary: request.message, needsClarification: true },
          userFacingMessage: message,
          ...(pendingAction.decision.proposal ? { proposal: pendingAction.decision.proposal } : {})
        } };
      }
      if (annualProjection?.eventCount === 2) {
        const message = describeAnnualProjection(annualProjection);
        return { message, decision: {
          action: "reflect",
          classification: { type: "general_finance", confidence: 1, summary: request.message, needsClarification: false },
          userFacingMessage: message
        } };
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
      if (isSafePendingWorkflowTopicSwitch(request.message) && this.dependencies.conversationResponder) {
        await this.learnFromReadOnlyTopicTurn(request);
        const readOnlyContext = buildVictoriaConversationContext({
          priorTurns: conversationContext,
          turnContext,
          message: request.message,
          // A topic switch is not an event-history request; do not expose unrelated event records.
          savingsEvents: [],
          ...(pendingSavingsConversationState ? { workflowState: pendingSavingsConversationState } : {})
        });
        return this.respondConversationalTurn(request, conversationContext,
          "I can help think that through. What part would be most useful to start with? The savings suggestion remains pending and has not been recorded.",
          "savings_entry", readOnlyContext.conversationSavingsEvents, readOnlyContext);
      }
    }

    const priorUserTurn = conversationContext.at(-2);
    const priorVictoriaTurn = conversationContext.at(-1);
    const priorRecordedAmountText = priorVictoriaTurn?.match(/^Victoria: Done\. I recorded (\$[\d,]+(?:\.\d{2})?)/)?.[1];
    const priorRecordedAmount = priorRecordedAmountText
      ? parseExplicitDollarAmount(priorRecordedAmountText) : undefined;
    if (priorUserTurn?.trim().toLowerCase() === request.message.trim().toLowerCase() &&
        priorVictoriaTurn?.startsWith("Victoria: Done. I recorded ") &&
        interpretApprovalResponse(request.message,
          priorRecordedAmount?.status === "valid" ? priorRecordedAmount.amountCents : undefined) === "explicit_approval") {
      const recentlyRecorded = this.recentSavingsEntriesByConversation.get(conversationKey);
      const message = recentlyRecorded && priorRecordedAmount?.status === "valid" &&
        recentlyRecorded.amountCents === priorRecordedAmount.amountCents
        ? "That savings entry is already recorded in your mocked Victoria savings ledger. No real money has moved."
        : "This looks like a repeat of your last approval. Is this a separate new savings moment? I won't add another entry until that's clear.";
      return { message, decision: {
        action: recentlyRecorded ? "reflect" : "ask_follow_up",
        classification: { type: "general_finance", confidence: 1, summary: request.message, needsClarification: false },
        userFacingMessage: message
      } };
    }

    if (annualProjection?.eventCount === 2 &&
        isCurrentMonthRecordRequest(request.message)) {
      const message = describeCombinedProjectionAndClarifyRecordTarget(
        annualProjection,
        turnContext.annualProjection?.eventCount === 2 ? turnContext.recurringCosts : undefined
      );
      return { message, decision: {
        action: "ask_follow_up",
        classification: { type: "unclear", confidence: 1, summary: request.message, needsClarification: true },
        userFacingMessage: message
      } };
    }
    if (annualProjection) {
      const message = describeAnnualProjection(annualProjection);
      return { message, decision: {
        action: "reflect",
        classification: { type: "general_finance", confidence: 1, summary: request.message, needsClarification: false },
        userFacingMessage: message
      } };
    }
    if (turnContext.unresolvedCombinedProjection) {
      const message = "Which two recurring costs do you mean? I don't want to combine the wrong amounts, and I haven't recorded anything.";
      return { message, decision: {
        action: "ask_follow_up",
        classification: { type: "unclear", confidence: 1, summary: request.message, needsClarification: true },
        userFacingMessage: message
      } };
    }
    if (turnContext.possibleRecordedRepeatAmountCents !== undefined) {
      const message = `This sounds like the ${formatUsd(turnContext.possibleRecordedRepeatAmountCents)} savings moment we just discussed. Is it a separate new occurrence? I won't add another entry until that's clear.`;
      return { message, decision: {
        action: "ask_follow_up",
        classification: { type: "unclear", confidence: 1, summary: request.message, needsClarification: true },
        userFacingMessage: message
      } };
    }

    const spendCorrection = extractConversationalSpendCorrection(request.message);
    if (spendCorrection && !pendingCorrection && !pendingGoalAction && !pendingAction) {
      return this.correctRememberedSpendFromConversation(request, conversationContext, spendCorrection);
    }

    const speculativeSpendClaim = extractMerchantSpendClaim(request.message);
    if (speculativeSpendClaim?.isSpeculative) {
      let verified: Awaited<ReturnType<TransactionHistoryProvider["findTypicalMerchantSpend"]>> = null;
      if (this.dependencies.transactionHistory) {
        try {
          verified = await this.dependencies.transactionHistory.findTypicalMerchantSpend({
            userId: request.userId,
            merchantName: speculativeSpendClaim.merchantName
          });
        } catch {
          verified = null;
        }
      }
      const message = isUsableTransactionHistoryEstimate(verified)
        ? `You estimated ${formatUsd(speculativeSpendClaim.amountCents)} at ${speculativeSpendClaim.merchantName}. Recent linked transactions suggest about ${formatUsd(verified.amountCents)} across ${verified.transactionCount} purchases. I haven't saved the estimate as a lasting habit because you described it as uncertain.`
        : `I hear ${formatUsd(speculativeSpendClaim.amountCents)} at ${speculativeSpendClaim.merchantName} as an unverified estimate. I won't save it as a lasting habit while you're unsure.`;
      return {
        message,
        decision: {
          action: "reflect",
          classification: { type: "general_finance", confidence: 1, summary: request.message, needsClarification: false },
          userFacingMessage: message
        }
      };
    }

    const directCandidate = scopedAllocationTargetChoice ? null : extractConversationalMemory(request.message);
    const deferMixedFactToProvider = directCandidate && directCandidate.category !== "other" &&
      this.dependencies.conversationalMemoryExtractor &&
      directCandidate.evidence.trim() !== request.message.trim() &&
      parseExplicitDollarAmount(request.message).status === "valid";
    const extractedCandidate = deferMixedFactToProvider ? null : directCandidate;
    const embeddedInterestCandidate = extractConversationalMemories(request.message)
      .find((candidate) => candidate.category === "other" && candidate.key.startsWith("interest:"));
    const isInterestCorrection = extractedCandidate?.category === "other" &&
      extractedCandidate.key.startsWith("interest:") && extractedCandidate.sourceMetadata?.interestStatus === "inactive" &&
      isExplicitInterestCorrectionEvidence(request.message, extractedCandidate.evidence);
    const extractedMemory = extractedCandidate && extractedCandidate.evidence.length <= 240 &&
      (isExplicitUserEvidence(request.message, extractedCandidate.evidence) || isInterestCorrection) ? extractedCandidate : null;
    const interestMemory = extractedMemory?.category === "other" && extractedMemory.key.startsWith("interest:")
      ? extractedMemory
      : embeddedInterestCandidate && embeddedInterestCandidate.evidence.length <= 240 &&
        isExplicitUserEvidence(request.message, embeddedInterestCandidate.evidence)
        ? embeddedInterestCandidate
        : null;
    const interestDuringCoveredSpend = interestMemory != null && employerCoveredRecurringSpend(request.message) !== undefined;
    if (interestDuringCoveredSpend && interestMemory) {
      const existingMemories = await this.dependencies.memory.listConversationalMemories(request.userId);
      const prior = [...existingMemories].reverse().find((item) =>
        item.category === interestMemory.category && item.key === interestMemory.key);
      if (!prior || prior.value !== interestMemory.value || prior.evidence !== interestMemory.evidence) {
        await this.dependencies.memory.rememberConversationalMemory(request.userId, {
            ...withCurrentTurnEvidence(interestMemory, request),
            ...(prior ? { supersedesId: prior.id } : {})
          });
      }
      interestSavedThisTurn = true;
    }
    if (extractedMemory && !interestDuringCoveredSpend) {
      let memoryToRemember = extractedMemory;
      let acknowledgement: string | undefined;
      const merchantSpendClaim = extractMerchantSpendClaim(request.message);
      if (merchantSpendClaim && this.dependencies.transactionHistory) {
        try {
          const transactionEvidence = await this.dependencies.transactionHistory.findTypicalMerchantSpend({
            userId: request.userId,
            merchantName: merchantSpendClaim.merchantName
          });
          if (isUsableTransactionHistoryEstimate(transactionEvidence)) {
            const checkedAmount = formatUsd(transactionEvidence.amountCents);
            const statedAmount = formatUsd(merchantSpendClaim.amountCents);
            const matches = !isMateriallyDifferentSpend(transactionEvidence.amountCents, merchantSpendClaim.amountCents);
            memoryToRemember = {
              ...extractedMemory,
              value: matches
                ? extractedMemory.value
                : `Usually spends ${checkedAmount} at ${merchantSpendClaim.merchantName}.`,
              evidence: `User stated: ${request.message} Transaction history suggests ${checkedAmount} from ${transactionEvidence.transactionCount} transactions through ${transactionEvidence.observedThrough}.`,
              confidence: 0.9
            };
            acknowledgement = matches
              ? `Your ${statedAmount} estimate is broadly consistent with recent linked transactions, which suggest about ${checkedAmount} at ${merchantSpendClaim.merchantName} across ${transactionEvidence.transactionCount} purchases. I'll remember your estimate.`
              : `You estimated ${statedAmount} at ${merchantSpendClaim.merchantName}. Your recent linked transactions suggest about ${checkedAmount} across ${transactionEvidence.transactionCount} purchases, so I'll use that as the current estimate and keep your original statement in memory history.`;
          }
        } catch {
          // A missing or failed transaction source leaves the user's own claim intact.
        }
      }
      const existingMemories = await this.dependencies.memory.listConversationalMemories(request.userId);
      const prior = [...existingMemories].reverse().find((item) =>
        item.category === memoryToRemember.category && item.key === memoryToRemember.key);
      if (!prior || prior.value !== memoryToRemember.value || prior.evidence !== memoryToRemember.evidence) {
        await this.dependencies.memory.rememberConversationalMemory(request.userId, {
          ...withCurrentTurnEvidence(memoryToRemember, request),
          ...(prior ? { supersedesId: prior.id } : {})
        });
      }
      const additionalCandidates = extractConversationalMemories(request.message).slice(1).filter((candidate) => {
        const supportedInterest = candidate.category === "other" && candidate.key.startsWith("interest:");
        const supportedActivityFact = candidate.category === "financial_pattern" &&
          (candidate.key.startsWith("interest_spend:") || candidate.key.startsWith("activity_mapping:"));
        return (supportedInterest || supportedActivityFact) && candidate.evidence.length <= 240 &&
          (isExplicitUserEvidence(request.message, candidate.evidence) ||
            (candidate.sourceMetadata?.interestStatus === "inactive" &&
              isExplicitInterestCorrectionEvidence(request.message, candidate.evidence)));
      });
      for (const candidate of additionalCandidates) {
        const history = await this.dependencies.memory.listConversationalMemories(request.userId);
        const previous = [...history].reverse().find((item) =>
          item.category === candidate.category && item.key === candidate.key);
        if (!previous || previous.value !== candidate.value || previous.evidence !== candidate.evidence) {
          await this.dependencies.memory.rememberConversationalMemory(request.userId, {
            ...withCurrentTurnEvidence(candidate, request),
            ...(previous ? { supersedesId: previous.id } : {})
          });
        }
      }
      const activitySpendFacts = [memoryToRemember, ...additionalCandidates]
        .filter((candidate) => candidate.key.startsWith("interest_spend:"));
      const multiSpendAcknowledgement = activitySpendFacts.length > 1
        ? `Got it. I'll remember these recurring activity-spend amounts: ${activitySpendFacts.map((fact) =>
            `${String(fact.sourceMetadata?.activity ?? fact.key.slice("interest_spend:".length))}: ${fact.value.match(/\$\d[\d,.]* per (?:session|week|month|year|day|visit|class|trip)/i)?.[0] ?? "amount noted"}`
          ).join(", ")}.`
        : undefined;
      const message = acknowledgement ?? multiSpendAcknowledgement ?? (typeof memoryToRemember.sourceMetadata?.activity === "string" &&
        typeof memoryToRemember.sourceMetadata?.target === "string"
        ? `Got it. I'll use your linked transaction ${String(memoryToRemember.sourceMetadata.dimension)} “${String(memoryToRemember.sourceMetadata.target)}” for ${String(memoryToRemember.sourceMetadata.activity)} spending when we discuss that activity.`
        : memoryToRemember.sourceMetadata?.interestStatus === "inactive"
        ? `Thanks for correcting me. I'll update that and won't assume you still enjoy ${memoryToRemember.value.replace(/^No longer enjoys |\.$/g, "")}.`
        : merchantSpendClaim?.isSpeculative
          ? `I'll keep ${formatUsd(merchantSpendClaim.amountCents)} at ${merchantSpendClaim.merchantName} as an unverified estimate for now.`
          : `Got it. I'll remember: “${memoryToRemember.value}”`);
      const classification: ClassifiedMessage = {
        type: "general_finance", confidence: 1, summary: request.message, needsClarification: false
      };
      if ((pendingCorrection || pendingGoalAction || pendingAction) && !isOrdinaryQuestion(request.message)) {
        const pendingPrompt = pendingCorrection
          ? "Please also give me a clear yes or no about the pending correction."
          : pendingGoalAction
            ? "Please also give me a clear yes or no about the pending goal allocation."
            : "Please also give me a clear yes or no about the pending savings entry.";
        const followUp = `${message} ${pendingPrompt}`;
        return {
          message: followUp,
          decision: { action: "ask_follow_up", classification, userFacingMessage: followUp }
        };
      }
      const isMixedFinancialTurn = extractedMemory.evidence.trim() !== request.message.trim() &&
        parseExplicitDollarAmount(request.message).status === "valid";
      if (!isMixedFinancialTurn && !isOrdinaryQuestion(request.message) && !this.dependencies.conversationResponder) {
        return { message, decision: { action: "reflect", classification, userFacingMessage: message } };
      }
    }

    let memory = await this.dependencies.memory.getMemoryForUser(request.userId, request.message);
    if (memory.conversationalMemories?.some((item) => item.sourceMetadata?.memoryKind === "episodic_summary")) {
      const lifecycleMemories = await this.dependencies.memory.listCurrentConversationalMemories?.(request.userId, true) ?? [];
      memory = {
        ...memory,
        conversationalMemories: [...suppressLifecycleConflictingEpisodes(memory.conversationalMemories, lifecycleMemories)]
      };
    }
    const activityMapping = (memory.conversationalMemories ?? []).find((item) =>
      item.key.startsWith("activity_mapping:") && isSpendingQuestion(request.message) &&
      isMemoryTopicMatched(item, request.message) && typeof item.sourceMetadata?.profileKey === "string");
    if (activityMapping && typeof activityMapping.sourceMetadata?.target === "string") {
      const linkedProfile = await this.dependencies.memory.getMemoryForUser(request.userId, activityMapping.sourceMetadata.target);
      memory = {
        ...memory,
        conversationalMemories: [...(memory.conversationalMemories ?? []), ...(linkedProfile.conversationalMemories ?? [])]
          .filter((item, index, all) => all.findIndex((candidate) => candidate.id === item.id) === index)
      };
    }
    const pendingClarification = await this.getPendingAmountClarification(request);
    const parsedReplyAmount = parseExplicitDollarAmount(request.message);
    const isPendingAmountAnswer = pendingClarification !== undefined &&
      parsedReplyAmount.status === "valid" && isSimpleAmountReply(request.message);
    const isPendingRevisionAmountAnswer = pendingAction?.awaitingValidRevision === true &&
      parsedReplyAmount.status === "valid" && isSimpleAmountReply(request.message);
    if (pendingAction?.awaitingRevisionTarget) {
      const message = "I couldn't match that change to the active savings suggestion. I can't target an older event from this request. Please decline the current suggestion before starting a separate savings request; nothing has been changed or recorded.";
      return { message, decision: {
        ...pendingAction.decision, action: "ask_follow_up", userFacingMessage: message
      } };
    }
    const pendingAmountWorkflowState = buildAwaitingAmountConversationState(request.userId, pendingClarification);
    const conversationWorkflowState = selectConversationWorkflowState({
      ...(pendingAmountWorkflowState ? { awaitingAmount: pendingAmountWorkflowState } : {}),
      ...(pendingSavingsConversationState ? { awaitingConfirmation: pendingSavingsConversationState } : {})
    });
    const conversationSavingsEvents = await this.savingsEvents.list(request.userId, request.conversationId ?? "default");
    const financialContext = buildVictoriaConversationContext({
      priorTurns: conversationContext,
      turnContext,
      message: request.message,
      selectedMemories: memory.conversationalMemories ?? [],
      savingsEvents: conversationSavingsEvents,
      ...(conversationWorkflowState ? { workflowState: conversationWorkflowState } : {})
    });
    const independentQuestion = independentOrdinaryQuestion(request.message);
    const canUseEventHistory = !independentQuestion && isReadOnlyEventHistoryQuestion(request.message);
    const responderFinancialContext = canUseEventHistory
      ? financialContext
      : withoutConversationEventHistory(financialContext);
    if (canUseEventHistory && this.dependencies.conversationResponder &&
        (financialContext.historicalEventReference?.kind === "ambiguous" ||
          financialContext.historicalEventReference?.kind === "not_found")) {
      const reference = financialContext.historicalEventReference;
      const message = reference.kind === "ambiguous"
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
    const responsePreferenceInput = conversationResponsePreferenceInput(memory.conversationalMemories ?? []);
    const episodicSummaries = selectConversationEpisodeSummaries(memory.conversationalMemories ?? [], request.message);
    const contextSnapshot = buildConversationContextSnapshot({
      message: request.message,
      recentTurns: conversationContext,
      memories: conversationResponderMemories(memory.conversationalMemories ?? [], responderFinancialContext, request.message),
      episodicSummaries,
      ...responsePreferenceInput,
      ...(pendingAction ? { pendingAction: "savings_entry" as const } : {}),
      ...(canUseEventHistory ? { conversationSavingsEvents: responderFinancialContext.conversationSavingsEvents } : {}),
      financialContext: responderFinancialContext
    });
    const activeProposalReference = financialContext.workflowState?.status === "awaiting_confirmation"
      ? financialContext.workflowState.currentMessageProposalReference
      : undefined;
    const amountRevisionIssue = parsedReplyAmount.status === "multiple_amounts" ? "multiple_amounts"
      : parsedReplyAmount.status === "invalid_precision" ? "invalid_precision"
      : parsedReplyAmount.status === "unsupported_currency" ? "unsupported_currency"
      : parsedReplyAmount.status === "invalid_value" ? "invalid_value"
      : undefined;
    if (pendingAction && pendingActionId && pendingAction.userId === request.userId && amountRevisionIssue &&
        activeProposalReference && activeProposalReference.actionId === pendingSavingsConversationState?.actionId &&
        activeProposalReference.proposalId === pendingSavingsConversationState?.proposalId &&
        activeProposalReference.eventId === pendingSavingsConversationState?.eventId) {
      this.pendingSavingsActions.set(pendingActionId, { ...pendingAction, awaitingValidRevision: true });
      const message = amountRevisionIssue === "multiple_amounts"
        ? "I found more than one dollar amount, so I haven't changed the pending suggestion. Which single amount in USD should I use?"
        : amountRevisionIssue === "invalid_precision"
          ? "That revised amount has more than two decimal places, so I haven't changed the pending suggestion. What amount in USD should I use?"
          : amountRevisionIssue === "unsupported_currency"
            ? "I can only record USD amounts, so I haven't changed the pending suggestion. What amount in USD should I use?"
            : "A savings amount must be positive, so I haven't changed the pending suggestion. What positive amount in USD should I use?";
      const classification: ClassifiedMessage = {
        type: "proposal_revision", confidence: 1, amountIssue: amountRevisionIssue,
        summary: request.message.slice(0, 500), needsClarification: true
      };
      return {
        message,
        decision: { ...pendingAction.decision, action: "ask_follow_up", classification, userFacingMessage: message }
      };
    }
    const { classification: classifiedMessage, teamAdvice, resolvedReference } = isPendingRevisionAmountAnswer
      ? {
          classification: {
            type: "proposal_revision" as const,
            confidence: 1,
            ...(parsedReplyAmount.status === "valid" ? { amountCents: parsedReplyAmount.amountCents } : {}),
            summary: request.message.slice(0, 500),
            needsClarification: false
          },
          teamAdvice: undefined,
          resolvedReference: undefined
        }
      : isPendingAmountAnswer
      ? {
          classification: {
            ...pendingClarification.classification,
            ...(parsedReplyAmount.status === "valid" ? { amountCents: parsedReplyAmount.amountCents } : {}),
            needsClarification: false
          },
          teamAdvice: undefined,
          resolvedReference: undefined
        }
      : await this.classifyWithTeam(request.message, memory, conversationContext, financialContext, contextSnapshot);
    const classification = resolveCoveredSpendPeriodAnswer(classifiedMessage, request.message, conversationContext);
    const planningChoice = pendingAction?.decision.planningChoice;
    if (pendingAction && pendingActionId && pendingAction.decision.proposal?.status === "pending" &&
        planningChoice?.selectedHorizon === "annual" && resolvedReference?.period === "annual" &&
        resolvedReference.meaning === "conditional_projection" &&
        resolvedReference.amountCents === planningChoice.annualProjectionCents &&
        /\b(?:record|log|save|add)\b/i.test(request.message)) {
      const message = `I understand you mean the ${formatUsd(resolvedReference.amountCents)} annual projection, based on ${formatUsd(planningChoice.monthlyAmountCents)} a month if coverage continues for 12 months. I can't record a projection as savings. The pending entry is still this month's ${formatUsd(planningChoice.monthlyAmountCents)}; say yes only if you'd like me to record that in your Victoria savings ledger. No real money moves.`;
      return { message, decision: {
        ...pendingAction.decision,
        action: "ask_follow_up",
        userFacingMessage: message
      } };
    }
    let memoryAcknowledgement: string | undefined;
    const memoryLearningTurn = isMemoryLearningEligibleTurn({
      message: request.message,
      intent: classification.type,
      ...(classification.uncertainIntent ? { uncertainIntent: classification.uncertainIntent } : {})
    });
    if (memoryLearningTurn && !scopedAllocationTargetChoice && !interestSavedThisTurn && this.dependencies.conversationalMemoryExtractor &&
        !pendingCorrection && !pendingGoalAction && !pendingAction) {
      try {
        const candidates = await this.dependencies.conversationalMemoryExtractor.extract({ userMessage: request.message });
        const memories = validateMemoryCandidates(candidates, request.message);
        for (const candidate of memories) {
          const history = await this.dependencies.memory.listConversationalMemories(request.userId);
          const prior = [...history].reverse().find((item) =>
            item.category === candidate.category && item.key === candidate.key);
          if (prior?.value === candidate.value && prior.evidence === candidate.evidence) continue;
          await this.dependencies.memory.rememberConversationalMemory(request.userId, {
            ...withCurrentTurnEvidence(candidate, request),
            ...(prior ? { supersedesId: prior.id } : {})
          });
        }
        if (memories.length > 0) {
          memoryAcknowledgement = "I'll keep that in mind for future conversations.";
          if (classification.type === "general_finance" && !isOrdinaryQuestion(request.message) && !this.dependencies.conversationResponder) {
            const message = `Got it. ${memoryAcknowledgement}`;
            return {
              message,
              decision: { action: "reflect", classification, userFacingMessage: message }
            };
          }
        }
      } catch {
        try {
          this.dependencies.onConversationalMemoryExtractionFailure?.("provider_or_validation_error");
        } catch {
          // Failure reporting is best-effort and cannot block the current turn.
        }
        // Optional extraction cannot block the current turn or financial safety checks.
      }
    }
    if (this.dependencies.conversationResponder && shouldRouteToConversationResponder(request.message)) {
      return this.respondConversationalTurn(request, conversationContext,
        "I can help think that through. What would be most useful to focus on first?", undefined,
        canUseEventHistory ? responderFinancialContext.conversationSavingsEvents : undefined,
        responderFinancialContext,
        memoryAcknowledgement ? undefined : contextSnapshot);
    }
    if (["avoided_spend", "regretful_spend", "pattern_reflection"].includes(classification.type)) {
      await this.dependencies.memory.rememberDecision(request.userId, {
        type: classification.type,
        summary: classification.summary,
        ...(classification.amountCents === undefined ? {} : { amountCents: classification.amountCents }),
        ...(classification.merchantName === undefined ? {} : { merchantName: classification.merchantName })
      });
    }

    if (classification.type === "real_money_movement_request") {
      const pendingAmountCents = pendingAction?.decision.suggestion?.amountCents;
      const pendingGoalAllocation = pendingGoalAction?.decision.goalAllocation;
      const pendingAmount = classification.amountCents ?? (pendingGoalAllocation?.status === "pending"
        ? pendingGoalAllocation.amountCents
        : pendingAmountCents);
      const coreMessage = pendingGoalAllocation?.status === "pending"
        ? `I can't move real money in the Victoria MVP. I can record the ${formatUsd(pendingGoalAllocation.amountCents)} goal allocation toward ${pendingGoalAllocation.goalName} in the mocked Victoria savings ledger after you explicitly confirm. No transfer has been made.`
        : pendingAmount === undefined
        ? "I can't move real money in the Victoria MVP. I can only record savings in the mocked Victoria savings ledger after we identify an amount and you explicitly confirm. No transfer has been made."
        : pendingAction || classification.amountCents === undefined
        ? `I can't move real money in the Victoria MVP. I can record ${formatUsd(pendingAmount)} in the mocked Victoria savings ledger after you confirm. No transfer has been made.`
        : `I can't move real money in the Victoria MVP. I understood you mean ${formatUsd(pendingAmount)}. No transfer has been made. If you'd like, I can help record that amount in the mocked Victoria savings ledger; ask me to record it and I'll request your confirmation first.`;
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
      const proposalReference = financialContext?.workflowState?.status === "awaiting_confirmation"
        ? financialContext.workflowState.currentMessageProposalReference
        : undefined;
      if (!pendingSavingsConversationState || proposalReference?.actionId !== pendingSavingsConversationState.actionId ||
          proposalReference.proposalId !== pendingSavingsConversationState.proposalId ||
          proposalReference.eventId !== pendingSavingsConversationState.eventId) {
        this.pendingSavingsActions.set(pendingActionId, {
          ...pendingAction,
          awaitingRevisionTarget: true
        });
        const message = "I couldn't match that change to the active savings suggestion. I can't target an older event from this request. Please decline the current suggestion before starting a separate savings request; nothing has been changed or recorded.";
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

    // A read-only reflection is still a topic shift when the user states it
    // without a question mark (for example, “I've been anxious about money”).
    // The responder has no mutation authority, so it can answer while leaving
    // the exact pending proposal untouched.
    const readOnlyFollowUp = classification.type === "general_finance" ||
      classification.type === "pattern_reflection" || classification.type === "savings_progress";
    const uncertainPendingRevision = classification.type === "unclear" &&
      classification.uncertainIntent === "proposal_revision";
    const groundedRevisionAmountReply = pendingAction?.awaitingValidRevision &&
      classification.amountCents !== undefined;
    if (pendingAction && !readOnlyFollowUp && classification.type !== "proposal_revision" &&
        !groundedRevisionAmountReply && !uncertainPendingRevision) {
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

    if (pendingAction?.awaitingValidRevision && classification.amountCents !== undefined) {
      const proposalReference = financialContext?.workflowState?.status === "awaiting_confirmation"
        ? financialContext.workflowState.currentMessageProposalReference
        : undefined;
      if (!pendingSavingsConversationState || proposalReference?.actionId !== pendingSavingsConversationState.actionId ||
          proposalReference.proposalId !== pendingSavingsConversationState.proposalId ||
          proposalReference.eventId !== pendingSavingsConversationState.eventId ||
          proposalReference.matchedBy !== "revision_follow_up") {
        const message = "Please provide one clear USD amount for the pending suggestion revision, or decline the pending suggestion. I haven't changed or recorded it.";
        return { message, decision: {
          ...pendingAction.decision,
          action: "ask_follow_up",
          classification,
          userFacingMessage: message
        } };
      }
      return this.replacePendingSavingsProposal(request, pendingAction.decision, {
        ...classification,
        type: "proposal_revision"
      });
    }

    if (pendingAction && ((!answerToRecentQuestion && !readOnlyFollowUp) || uncertainPendingRevision)) {
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

    let resolvedSavingsEvent: SavingsEvent | undefined;
    const resolvedClassification =
      pendingClarification !== undefined &&
      classification.amountCents !== undefined &&
      (classification.type === "unclear" || isPendingAmountAnswer)
        ? {
            ...pendingClarification.classification,
            amountCents: classification.amountCents,
            needsClarification: false
          }
        : classification;

    if (resolvedClassification !== classification) {
      resolvedSavingsEvent = pendingClarification?.savingsEvent;
      await this.clearPendingAmountClarification(request);
      const merchantName = pendingClarification?.classification.merchantName;
      if (merchantName && classification.amountCents !== undefined) {
        await this.rememberMerchantSpendAnswer(request, merchantName, classification.amountCents, request.message);
      }
    } else if (pendingClarification && classification.type !== "unclear") {
      await this.clearPendingAmountClarification(request);
    }

    let decision = await this.decide(
      request,
      resolvedClassification,
      resolvedSavingsEvent,
      teamAdvice
    );
    let userFacingMessage = composeTeamDecisionMessage(decision, teamAdvice);
    if (decision.action === "suggest_savings" && independentQuestion && !teamAdvice &&
        this.dependencies.conversationResponder && decision.proposal?.status === "pending") {
      const conversationalAnswer = await this.generateConversationReply({
        message: request.message,
        responseFocus: independentQuestion,
        recentTurns: conversationContext,
        memories: contextSnapshot.selectedMemories,
        episodicSummaries: contextSnapshot.episodicSummaries,
        baselineReply: "I can answer that separately. What would you like to know?",
        ...responsePreferenceInput,
        pendingAction: "savings_entry",
        financialContext: responderFinancialContext,
        contextSnapshot
      });
      userFacingMessage = `${conversationalAnswer} ${userFacingMessage}`;
      decision = { ...decision, userFacingMessage };
    }
    if (decision.action === "reflect" && resolvedClassification.type === "regretful_spend" &&
        independentQuestion && this.dependencies.conversationResponder) {
      const conversationalAnswer = await this.generateConversationReply({
        message: request.message,
        responseFocus: independentQuestion,
        recentTurns: conversationContext,
        memories: contextSnapshot.selectedMemories,
        episodicSummaries: contextSnapshot.episodicSummaries,
        baselineReply: "A pot of lentil and tomato soup with bread is easy to make together and uses inexpensive pantry staples.",
        ...responsePreferenceInput,
        financialContext: responderFinancialContext,
        contextSnapshot
      });
      userFacingMessage = `${userFacingMessage} ${conversationalAnswer}`;
      decision = { ...decision, userFacingMessage };
    }
    if (decision.action === "reflect" &&
        (resolvedClassification.type === "general_finance" || resolvedClassification.type === "pattern_reflection")) {
      const personalizedMessage = isAnswerToRecentVictoriaQuestion(conversationContext)
        ? undefined
        : personalizeOrdinaryReply(
            memory, userFacingMessage, request.message, resolvedClassification.type === "pattern_reflection"
          );
      if (personalizedMessage) {
        userFacingMessage = personalizedMessage;
        decision = { ...decision, userFacingMessage };
      }
    }

    if (decision.action === "reflect" &&
        (resolvedClassification.type === "general_finance" || resolvedClassification.type === "pattern_reflection" ||
          (resolvedClassification.type === "unclear" && !resolvedClassification.uncertainIntent)) &&
        this.dependencies.conversationResponder) {
      userFacingMessage = await this.generateConversationReply({
        message: request.message,
        recentTurns: conversationContext,
        memories: contextSnapshot.selectedMemories,
        episodicSummaries: contextSnapshot.episodicSummaries,
        baselineReply: userFacingMessage,
        ...responsePreferenceInput,
        ...(pendingAction ? { pendingAction: "savings_entry" as const } : {}),
        ...(canUseEventHistory ? { conversationSavingsEvents: responderFinancialContext.conversationSavingsEvents } : {}),
        financialContext: responderFinancialContext,
        contextSnapshot
      });
      decision = { ...decision, userFacingMessage };
    }

    if (memoryAcknowledgement && !isOrdinaryQuestion(request.message) && !this.dependencies.conversationResponder &&
        (decision.action === "reflect" || decision.action === "ask_follow_up")) {
      userFacingMessage = `${userFacingMessage} ${memoryAcknowledgement}`;
      decision = { ...decision, userFacingMessage };
    }

    if (decision.action === "reflect" &&
        (resolvedClassification.type === "general_finance" || resolvedClassification.type === "pattern_reflection") &&
        (!isSpendingQuestion(request.message) || isAnswerToRecentVictoriaQuestion(conversationContext)) &&
        this.dependencies.personalizedReplyPersonalizer && !this.dependencies.conversationResponder) {
      const personalizationMemories = selectPersonalizationMemories(memory.conversationalMemories ?? [], request.message, conversationContext);
      if (personalizationMemories.length > 0) {
        try {
          const personalizationInput = {
            userMessage: request.message,
            baselineReply: userFacingMessage,
            memories: personalizationMemories,
            conversationContext,
            ...getPriorCoveredSpendProjection(conversationContext)
          };
          let personalized = validatePersonalizedReply(
            await this.dependencies.personalizedReplyPersonalizer.personalize(personalizationInput),
            personalizationInput
          );
          if (!personalized) {
            const annualTargetSelected = personalizationInput.validatedAnnualProjectionCents !== undefined &&
              /\b(?:annual|year|yearly|annually)\b/i.test(request.message);
            console.warn("Victoria personalized reply failed context validation; requesting one concise revision.", {
              hasValidatedAnnualProjection: personalizationInput.validatedAnnualProjectionCents !== undefined,
              annualTargetSelected
            });
            const revisionInput = {
              ...personalizationInput,
              revisionFeedback: annualTargetSelected
                ? "The prior draft failed conversational validation. Respond to the user's annual allocation-target choice using the supplied conditional annual projection, preserve the ongoing personal context, and keep the response concise. Do not offer to record any amount or imply a real transfer during this reflection."
                : "The prior draft failed conversational validation. Answer the current turn naturally and concisely, preserve relevant personal context, use only validated amounts and supplied memory IDs, and do not claim an action is complete or imply real money movement. Do not offer to record a ledger entry or recommend an investment product."
            };
            personalized = validatePersonalizedReply(
              await this.dependencies.personalizedReplyPersonalizer.personalize(revisionInput),
              revisionInput
            );
          }
          if (personalized) {
            userFacingMessage = personalized.message;
            decision = { ...decision, userFacingMessage };
          } else {
            console.warn("Victoria personalized reply did not pass context validation; retaining the safe baseline.", {
              hasValidatedAnnualProjection: personalizationInput.validatedAnnualProjectionCents !== undefined,
              recentQuestionContext: isAnswerToRecentVictoriaQuestion(conversationContext)
            });
          }
        } catch (error) {
          console.warn("Victoria personalized reply unavailable; retaining the safe baseline.", {
            errorName: error instanceof Error ? error.name : "non_error_throwable"
          });
          // Personalized wording is optional; retain the deterministic baseline on provider failure.
        }
      }
    }

    return {
      message: userFacingMessage,
      decision: userFacingMessage === decision.userFacingMessage
        ? decision
        : { ...decision, userFacingMessage }
    };
  }

  private async respondConversationalTurn(
    request: AgentRequest,
    recentTurns: readonly string[],
    baselineReply: string,
    pendingAction?: ConversationResponderInput["pendingAction"],
    conversationSavingsEvents?: ConversationResponderInput["conversationSavingsEvents"],
    financialContext?: VictoriaConversationContext,
    contextSnapshot?: ConversationContextSnapshot
  ): Promise<AgentResponse> {
    let memory = await this.dependencies.memory.getMemoryForUser(request.userId, request.message);
    if (memory.conversationalMemories?.some((item) => item.sourceMetadata?.memoryKind === "episodic_summary")) {
      const lifecycleMemories = await this.dependencies.memory.listCurrentConversationalMemories?.(request.userId, true) ?? [];
      memory = {
        ...memory,
        conversationalMemories: [...suppressLifecycleConflictingEpisodes(memory.conversationalMemories, lifecycleMemories)]
      };
    }
    const responderFinancialContext = financialContext
      ? conversationSavingsEvents ? financialContext : withoutConversationEventHistory(financialContext)
      : buildVictoriaConversationContext({
          priorTurns: recentTurns,
          turnContext: buildTurnContext({ message: request.message, priorTurns: recentTurns }),
          message: request.message,
          selectedMemories: memory.conversationalMemories ?? [],
          // Historical event data is exposed only when the caller explicitly resolved an event-history request.
          savingsEvents: []
        });
    const pendingWorkflowReference = pendingAction === "entry_correction" || pendingAction === "goal_allocation"
      ? this.pendingWorkflowReference(request, pendingAction)
      : undefined;
    const message = await this.generateConversationReply({
      message: request.message,
      recentTurns,
      memories: conversationResponderMemories(memory.conversationalMemories ?? [], responderFinancialContext, request.message),
      episodicSummaries: selectConversationEpisodeSummaries(memory.conversationalMemories ?? [], request.message),
      baselineReply,
      ...conversationResponsePreferenceInput(memory.conversationalMemories ?? []),
      ...(pendingAction ? { pendingAction } : {}),
      ...(pendingWorkflowReference ? { pendingWorkflowReference } : {}),
      ...(conversationSavingsEvents ? { conversationSavingsEvents } : {}),
      financialContext: responderFinancialContext,
      ...(contextSnapshot ? { contextSnapshot } : {})
    });
    return { message, decision: {
      action: "reflect",
      classification: { type: "general_finance", confidence: 1, summary: request.message, needsClarification: false },
      userFacingMessage: message
    } };
  }

  private pendingWorkflowReference(
    request: AgentRequest,
    kind: "entry_correction" | "goal_allocation"
  ): ConversationResponderInput["pendingWorkflowReference"] {
    const conversationKey = this.conversationKey(request);
    const actionId = kind === "entry_correction"
      ? this.pendingEntryCorrectionIdsByConversation.get(conversationKey)
      : this.pendingGoalAllocationIdsByConversation.get(conversationKey);
    if (!actionId) return undefined;
    const pending = kind === "entry_correction"
      ? this.pendingEntryCorrections.get(actionId)
      : this.pendingGoalAllocationActions.get(actionId);
    if (pending?.userId !== request.userId || pending.conversationKey !== conversationKey) return undefined;
    return { kind, actionId };
  }

  private async generateConversationReply(input: ConversationResponderInput): Promise<string> {
    if (!this.dependencies.conversationResponder) return input.baselineReply;
    const contextSnapshot = input.contextSnapshot ?? buildConversationContextSnapshot(input);
    const dialogue = contextSnapshot.dialogueTurns;
    const currentTurnIsLast = dialogue.at(-1)?.role === "user" &&
      dialogue.at(-1)?.content === contextSnapshot.currentMessage;
    const recentTurns = (currentTurnIsLast ? dialogue.slice(0, -1) : dialogue).map((turn) =>
      turn.role === "assistant" ? `Victoria: ${turn.content}` : turn.content
    );
    const responderInput: ConversationResponderInput = {
      message: input.responseFocus ?? contextSnapshot.currentMessage,
      recentTurns,
      memories: contextSnapshot.selectedMemories,
      episodicSummaries: contextSnapshot.episodicSummaries,
      baselineReply: input.baselineReply,
      ...(contextSnapshot.responsePreference ? { responsePreference: contextSnapshot.responsePreference } : {}),
      ...(contextSnapshot.pendingAction ? { pendingAction: contextSnapshot.pendingAction } : {}),
      ...(contextSnapshot.references?.pendingWorkflow
        ? { pendingWorkflowReference: contextSnapshot.references.pendingWorkflow } : {}),
      ...(contextSnapshot.financialContext ? { financialContext: contextSnapshot.financialContext } : {}),
      ...(contextSnapshot.conversationSavingsEvents
        ? { conversationSavingsEvents: contextSnapshot.conversationSavingsEvents } : {}),
      contextSnapshot
    };
    const fallbackReply = deterministicConversationFallback(responderInput);
    const isConstrainedWorkFollowUp =
      /\b(?:manager|schedule[sd]?|work|job|role)\b/i.test(responderInput.recentTurns.join(" ")) &&
      /\b(?:sunday|weekend|evening|cooking|friends?)\b/i.test(responderInput.recentTurns.join(" ")) &&
      /\b(?:one thing|one sentence|keep it to one|flexible)\b/i.test(responderInput.message) &&
      fallbackReply.trim() !== responderInput.baselineReply.trim();
    if (isConstrainedWorkFollowUp) return fallbackReply;
    let candidate: string;
    try {
      candidate = await this.dependencies.conversationResponder.respond(responderInput);
    } catch {
      this.reportConversationReplyFallback("provider_error");
      return fallbackReply;
    }
    const validated = validateConversationReply(candidate, responderInput);
    if (validated) {
      const unchangedBaseline = validated.trim().replace(/\s+/g, " ") ===
        responderInput.baselineReply.trim().replace(/\s+/g, " ");
      const hasMoreSpecificFallback = fallbackReply.trim().replace(/\s+/g, " ") !==
        responderInput.baselineReply.trim().replace(/\s+/g, " ");
      // A provider may return the safe generic baseline verbatim. When a
      // topic-specific deterministic fallback exists, use it instead of
      // presenting an answer that ignores the user's concrete situation.
      if (unchangedBaseline && hasMoreSpecificFallback) return fallbackReply;
      return validated;
    }

    // A malformed or ungrounded read-only draft should not immediately erase
    // the user's question. Give the responder one chance to correct its draft;
    // this path has no tools and cannot approve or mutate a financial action.
    const retryBaseline = `Your previous draft was not safe to show. Answer the user's current request directly, using only supported facts and no unsupported dollar amounts. Keep the pending ${responderInput.pendingAction ?? "financial action"} unchanged. If you cannot answer safely, use this fallback: ${responderInput.baselineReply}`;
    const retryInput: ConversationResponderInput = {
      ...responderInput,
      baselineReply: retryBaseline,
      contextSnapshot
    };
    try {
      const retry = await this.dependencies.conversationResponder.respond(retryInput);
      const validatedRetry = validateConversationReply(retry, retryInput);
      if (validatedRetry) return validatedRetry;
    } catch {
      this.reportConversationReplyFallback("provider_error");
      return fallbackReply;
    }
    this.reportConversationReplyFallback("invalid_after_retry");
    return fallbackReply;
  }

  private reportConversationReplyFallback(reason: "provider_error" | "invalid_after_retry"): void {
    try {
      this.dependencies.onConversationReplyFallback?.(reason);
    } catch {
      // Observability is best-effort and cannot block the safe fallback.
    }
  }

  private async learnFromReadOnlyTopicTurn(request: AgentRequest): Promise<void> {
    const extractor = this.dependencies.conversationalMemoryExtractor;
    if (!extractor) return;
    try {
      const candidates = await extractor.extract({ userMessage: request.message });
      for (const candidate of validateMemoryCandidates(candidates, request.message)) {
        await this.dependencies.memory.rememberConversationalMemory(request.userId, withCurrentTurnEvidence(candidate, request));
      }
    } catch {
      try {
        this.dependencies.onConversationalMemoryExtractionFailure?.("provider_or_validation_error");
      } catch {
        // Best-effort telemetry cannot block the read-only response.
      }
    }
  }

  private async correctRememberedSpendFromConversation(
    request: AgentRequest,
    conversationContext: readonly string[],
    correction: { readonly amountCents: number; readonly scopeText: string }
  ): Promise<AgentResponse> {
    const priorVictoriaStatement = [...conversationContext].reverse().find((message) =>
      message.startsWith("Victoria: ") && /\b(?:spend(?:s|ing)?|spent|purchase|transaction|charged|paid)\b/i.test(message)
    );
    const memories = await this.dependencies.memory.listConversationalMemories(request.userId);
    const target = priorVictoriaStatement
      ? findFinancialMemoryMentionedIn(priorVictoriaStatement, memories)
      : undefined;
    const classification: ClassifiedMessage = {
      type: target ? "general_finance" : "unclear",
      confidence: 1,
      summary: request.message,
      needsClarification: !target
    };
    if (!target || !(this.dependencies.memory instanceof MemoryOrchestrator)) {
      const message = "Which purchase or day are you correcting? I don't want to change the wrong financial detail.";
      return { message, decision: { action: "ask_follow_up", classification: { ...classification, type: "unclear", needsClarification: true }, userFacingMessage: message } };
    }

    await this.dependencies.memory.rememberTransactionCorrection({
      userId: request.userId,
      memoryId: target.id,
      amountCents: correction.amountCents,
      evidence: request.message,
      referenceText: correction.scopeText
    });
    const amount = formatUsd(correction.amountCents);
    const message = `Thanks for correcting me. I'll remember that you spent ${amount} on ${correction.scopeText}. I haven't changed or recorded any money.`;
    return { message, decision: { action: "reflect", classification, userFacingMessage: message } };
  }

  private async classifyWithTeam(
    message: string,
    memory: Awaited<ReturnType<MemoryProvider["getMemoryForUser"]>>,
    conversationContext: readonly string[] = [],
    financialContext?: VictoriaConversationContext,
    providedContextSnapshot?: ConversationContextSnapshot
  ): Promise<{
    classification: ClassifiedMessage;
    teamAdvice?: TeamAdvice;
    resolvedReference?: ResolvedFinancialReference;
  }> {
    const specialists = this.dependencies.specialists;
    const contextSnapshot = providedContextSnapshot ?? buildConversationContextSnapshot({
      message,
      recentTurns: conversationContext,
      memories: conversationResponderMemories(memory.conversationalMemories ?? [], financialContext, message),
      ...(financialContext ? { financialContext } : {})
    });
    const specialistFinancialContext = contextSnapshot.financialContext ?? financialContext;
    if (!specialists) {
      const candidate = await this.dependencies.llm.classifyMessage({
        userMessage: message, memory, conversationContext,
        ...(specialistFinancialContext ? { financialContext: specialistFinancialContext } : {})
      });
      const validated = validateClassifiedMessage(candidate) ?? fallbackFinding(message).classification;
      const resolvedReference = resolveFinancialReferenceHint(financialContext, validated.referenceHint);
      const cleanClassification = { ...groundExplicitAvoidedSpendAmount(validated, message) };
      delete cleanClassification.referenceHint;
      const classification = enforceMoneyMovementBoundary(message, cleanClassification);
      return {
        classification: applyClassificationConfidencePolicy(classification),
        ...(resolvedReference ? { resolvedReference } : {})
      };
    }

    let finding;
    let financialMomentValid = false;
    try {
      const candidate = await specialists.financialMoment.analyze({
        message, memory, conversationContext, contextSnapshot,
        ...(specialistFinancialContext ? { financialContext: specialistFinancialContext } : {})
      });
      const validated = validateTeamFinding(candidate, financialContext);
      finding = validated ?? fallbackFinding(message);
      financialMomentValid = validated !== null;
    } catch {
      finding = fallbackFinding(message);
    }
    finding = { ...finding, classification: groundExplicitAvoidedSpendAmount(finding.classification, message) };
    const classification = enforceMoneyMovementBoundary(message, applyClassificationConfidencePolicy(finding.classification));
    const coveredSpend = freedRecurringSpend(message);
    const periodAnswer = resolveCoveredSpendPeriodAnswer(classification, message, conversationContext);
    if (periodAnswer !== classification) {
      return {
        classification: periodAnswer,
        ...(finding.resolvedReference ? { resolvedReference: finding.resolvedReference } : {})
      };
    }
    if (coveredSpend && classification.type === "avoided_spend" &&
        classification.amountCents === coveredSpend.amountCents && classification.amountIssue === undefined) {
      // The recurring-cost parser has already grounded the event and amount in
      // the user's message, so a failed provider classification must not bypass
      // the dynamic reasoning and voice specialists for this supported case.
      financialMomentValid = true;
    }
    const interests = (memory.conversationalMemories ?? [])
      .filter((item) => item.category === "other" && item.key.startsWith("interest:") &&
        item.sourceMetadata?.interestStatus !== "inactive" && isMemoryTopicMatched(item, message))
      .map((item) => item.value.replace(/^Enjoys\s+|\.$/g, ""))
      .slice(0, 3);
    const annualProjection = coveredSpend?.cadence === "month" &&
      Number.isSafeInteger(coveredSpend.amountCents * 12)
      ? annualizeMonthlyAmountCents(coveredSpend.amountCents)
      : undefined;
    const responseContext = {
      ...(annualProjection === undefined ? {} : {
        validatedAdditionalAmountsCents: [annualProjection],
        validatedAnnualProjectionCents: annualProjection
      }),
      ...(interests.length === 0 ? {} : { rememberedInterests: interests }),
      ...(employerCoveredRecurringSpend(message) ? getPriorCoveredExpenseAllocation(memory.conversationalMemories ?? []) : {}),
      ...(coveredSpend && classification.type === "avoided_spend"
        ? { awaitingAllocationTargetChoice: true }
        : {})
    };
    finding = {
      classification,
      ...(finding.resolvedReference ? { resolvedReference: finding.resolvedReference } : {}),
      ...(Object.keys(responseContext).length === 0 ? {} : { responseContext })
    };
    if (!financialMomentValid || !isTeamSupportedClassification(classification)) return {
      classification,
      ...(finding.resolvedReference ? { resolvedReference: finding.resolvedReference } : {})
    };

    let assessment: SavingsAssessment;
    let savingsAssessmentValidated = false;
    const groundedCoveredSpend = coveredSpend && classification.type === "avoided_spend" &&
      classification.amountCents === coveredSpend.amountCents && classification.amountIssue === undefined;
    if (groundedCoveredSpend) {
      assessment = {
        outcome: "suggest",
        confidence: 1,
        amountCents: coveredSpend.amountCents,
        source: "user_provided",
        rationale: "The user stated the recurring monthly amount."
      };
    } else {
      try {
        const candidate = await specialists.savingsReasoning.assess({
          finding, memory, contextSnapshot,
          ...(specialistFinancialContext ? { financialContext: specialistFinancialContext } : {})
        });
        assessment = validateTeamAssessment(candidate, finding, memory);
        savingsAssessmentValidated = true;
      } catch {
        assessment = clarificationAfterSpecialistFailure("savingsReasoning");
      }
    }
    if (savingsAssessmentValidated && assessment.outcome === "ask" && classification.type === "avoided_spend" &&
        !classification.needsClarification && classification.amountIssue === undefined &&
        classification.amountCents !== undefined) {
      const explicitAmount = parseExplicitDollarAmount(message);
      const asksToRepeatKnownAmount = /\b(?:clarify|confirm|make sure)\b.{0,60}\b(?:amount|it)\b|\b(?:which|what) amount\b.{0,40}\b(?:use|should|did)\b/i
        .test(assessment.question);
      if (explicitAmount.status === "valid" && explicitAmount.amountCents === classification.amountCents &&
          asksToRepeatKnownAmount) {
        assessment = {
          outcome: "suggest",
          confidence: classification.confidence,
          amountCents: classification.amountCents,
          source: "user_provided",
          rationale: "The follow-up asked for an amount already explicitly stated and validated in the current message."
        };
      }
    }
    // Keep the clarification selected by Savings Reasoning intact. Companion
    // Voice is reserved for suggestion and reflection wording.
    if (assessment.outcome === "ask") {
      return {
        classification,
        teamAdvice: { assessment, message: assessment.question },
        ...(finding.resolvedReference ? { resolvedReference: finding.resolvedReference } : {})
      };
    }
    const disclosures = requiredDisclosures(finding, assessment);
    let draft: unknown;
    let voiceCallSucceeded = false;
    try {
      draft = await specialists.companionVoice.respond({ finding, assessment, requiredDisclosures: disclosures, contextSnapshot });
      voiceCallSucceeded = true;
    } catch {
      draft = undefined;
    }
    let finalized = finalizeCompanionResponse(draft, finding, assessment);
    for (let revisionNumber = 0; voiceCallSucceeded && revisionNumber < 1 && !finalized.voiceDraftAccepted; revisionNumber += 1) {
      try {
        const revision = await specialists.companionVoice.respond({
          finding,
          assessment,
          requiredDisclosures: disclosures,
          revisionFeedback: voiceDraftRevisionFeedback(finalized.validationIssues),
          contextSnapshot
        });
        voiceCallSucceeded = true;
        finalized = finalizeCompanionResponse(revision, finding, assessment);
      } catch {
        voiceCallSucceeded = false;
        break;
      }
    }
    if (voiceCallSucceeded && !finalized.voiceDraftAccepted) {
      try {
        this.dependencies.onCompanionVoiceValidationFailure?.(finalized.validationIssues);
      } catch {
        // Diagnostics are best-effort and must not interrupt the conversation.
      }
    }
    if (finalized.voiceDraftAccepted && finalized.validationIssues.length > 0) {
      console.info("Victoria companion voice added a required ledger confirmation to the generated reply.", {
        adjustments: finalized.validationIssues
      });
    }
    return {
      classification,
      ...(finding.resolvedReference ? { resolvedReference: finding.resolvedReference } : {}),
      teamAdvice: {
        assessment,
        message: finalized.message,
        ...(finding.responseContext?.awaitingAllocationTargetChoice ? { awaitingAllocationTargetChoice: true } : {})
      }
    };
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
      return {
        action: "ask_follow_up",
        classification,
        userFacingMessage: clarificationMessage(classification)
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
    const rememberedTypicalAmountCents = classification.merchantName
      ? await this.findRememberedMerchantSpend(request.userId, classification.merchantName)
      : undefined;
    const existingHabitAmount = classification.merchantName
      ? await this.dependencies.tools.findTypicalMerchantSpend({ userId: request.userId, merchantName: classification.merchantName })
      : null;
    const hasRelevantMemory = rememberedTypicalAmountCents !== undefined ||
      (existingHabitAmount !== null && Number.isSafeInteger(existingHabitAmount) && existingHabitAmount > 0);
    const canUseTransactionHistory = classification.amountCents === undefined && !hasRelevantMemory &&
      Boolean(classification.merchantName && this.dependencies.transactionHistory);
    const contextSource = selectFinancialContextSource({
      purpose: "avoided_spend_estimate",
      hasRelevantMemory,
      transactionHistoryAvailable: canUseTransactionHistory
    });
    let transactionHistoryResult: Awaited<ReturnType<TransactionHistoryProvider["findTypicalMerchantSpend"]>> = null;
    if (contextSource === "transaction_history" && classification.merchantName && this.dependencies.transactionHistory) {
      try {
        transactionHistoryResult = await this.dependencies.transactionHistory.findTypicalMerchantSpend({
          userId: request.userId,
          merchantName: classification.merchantName
        });
      } catch {
        transactionHistoryResult = null;
      }
    }
    const transactionHistoryEstimate = isUsableTransactionHistoryEstimate(transactionHistoryResult)
      ? transactionHistoryResult
      : null;
    const suggestion = await this.dependencies.tools.estimateAvoidedSpend({
      userId: request.userId,
      ...(classification.merchantName ? { merchantName: classification.merchantName } : {}),
      ...(rememberedTypicalAmountCents === undefined ? {} : { rememberedTypicalAmountCents }),
      ...(transactionHistoryEstimate === null ? {} : { transactionHistoryEstimate }),
      ...(classification.amountCents !== undefined
        ? { userProvidedAmountCents: classification.amountCents }
        : {})
    });

    if (!suggestion || !validateSavingsSuggestion(suggestion)) {
      await this.setPendingAmountClarification(request, {
        classification,
        savingsEvent
      });
      const rememberedMerchantHabit = !suggestion && classification.merchantName
        ? await this.findRememberedMerchantHabit(request.userId, classification.merchantName)
        : undefined;

      return {
        action: "ask_follow_up",
        classification,
        savingsEvent,
        userFacingMessage: classification.merchantName
          ? `${suggestion
            ? "I couldn't verify a reliable estimate."
            : rememberedMerchantHabit
              ? `I remember you mentioned “${sanitizeMemoryEvidence(rememberedMerchantHabit)}” I don't have a typical cost yet.`
              : "Nice choice."} About how much do you usually spend at ${classification.merchantName}? I'll remember your estimate for future suggestions.`
          : suggestion
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
        await this.setPendingAmountClarification(request, {
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

    const baseDecision = this.buildSavingsSuggestionDecision(classification, savingsEvent, suggestion);
    const coveredSpend = freedRecurringSpend(request.message);
    const annualProjectionCents = coveredSpend?.cadence === "month" &&
      Number.isSafeInteger(coveredSpend.amountCents * 12)
      ? annualizeMonthlyAmountCents(coveredSpend.amountCents)
      : undefined;
    const decision: AgentDecision = coveredSpend && annualProjectionCents !== undefined && teamAdvice?.awaitingAllocationTargetChoice
      ? { ...baseDecision, planningChoice: {
          monthlyAmountCents: coveredSpend.amountCents,
          annualProjectionCents
        } }
      : baseDecision;
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

  private async findRememberedMerchantSpend(userId: string, merchantName: string): Promise<number | undefined> {
    const memories = await this.dependencies.memory.listConversationalMemories(userId);
    const key = merchantSpendMemoryKey(merchantName);
    const memory = [...memories].reverse().find((item) => item.category === "habit" && item.key === key && item.confidence >= 0.8);
    const match = memory?.value.match(/^Usually spends \$(\d+(?:\.\d{2})?) at .+\.$/);
    if (!match?.[1]) return undefined;
    const amountCents = Math.round(Number(match[1]) * 100);
    return Number.isSafeInteger(amountCents) && amountCents > 0 ? amountCents : undefined;
  }

  private async findRememberedMerchantHabit(userId: string, merchantName: string): Promise<string | undefined> {
    const memories = await this.dependencies.memory.listConversationalMemories(userId);
    const key = merchantHabitMemoryKey(merchantName);
    return [...memories].reverse().find((item) => item.category === "habit" &&
      item.key === key && item.confidence >= 0.8)?.evidence;
  }

  private async rememberMerchantSpendAnswer(
    request: AgentRequest,
    merchantName: string,
    amountCents: number,
    answer: string
  ): Promise<void> {
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return;
    const memories = await this.dependencies.memory.listConversationalMemories(request.userId);
    const key = merchantSpendMemoryKey(merchantName);
    const prior = [...memories].reverse().find((item) => item.category === "habit" && item.key === key);
    const amount = formatUsd(amountCents);
    const value = `Usually spends ${amount} at ${merchantName}.`;
    if (prior?.value === value) return;
    await this.dependencies.memory.rememberConversationalMemory(request.userId, withCurrentTurnEvidence({
      category: "habit",
      key,
      value,
      evidence: `Asked about typical spend at ${merchantName}; user answered: ${answer}`,
      confidence: 0.9,
      ...(prior ? { supersedesId: prior.id } : {})
    }, request));
  }

  private async rememberCoveredRecurringAllocationBehavior(
    request: AgentRequest,
    event: SavingsEvent
  ): Promise<void> {
    const conversationContext = await this.dependencies.memory.getConversationContext(
      request.userId, request.conversationId ?? "default"
    );
    const sourceMessage = [...conversationContext].reverse().find((turn) =>
      !turn.startsWith("Victoria: ") &&
      employerCoveredRecurringSpend(turn)?.amountCents === event.userProvidedAmountCents);
    const coveredSpend = sourceMessage ? employerCoveredRecurringSpend(sourceMessage) : undefined;
    const targetChoice = getAllocationTargetChoiceFromConversation(conversationContext);
    const evidence = targetChoice
      ? `${sanitizeMemoryEvidence(sourceMessage ?? "")} | ${sanitizeMemoryEvidence(targetChoice.evidence)}`
      : sanitizeMemoryEvidence(sourceMessage ?? "");
    if (!coveredSpend || evidence.length > 240 ||
        !sourceMessage || !isExplicitUserEvidence(sourceMessage, sourceMessage) || !targetChoice) return;

    try {
      const key = "observed_behavior:covered_recurring_expense_to_savings";
      const history = await this.dependencies.memory.listConversationalMemories(request.userId);
      const previous = [...history].reverse().find((memory) => memory.category === "financial_pattern" && memory.key === key);
      if (previous?.evidence === evidence && previous.sourceMetadata?.lastPlanningHorizon === targetChoice.horizon) return;
      const priorCounts = readPlanningHorizonCounts(previous?.sourceMetadata?.planningHorizonCounts);
      const planningHorizonCounts = {
        ...priorCounts,
        [targetChoice.horizon]: priorCounts[targetChoice.horizon] + 1
      };
      const observationCount = planningHorizonCounts.monthly + planningHorizonCounts.annual;
      const moreOftenChosen = observationCount >= 2 && planningHorizonCounts.monthly !== planningHorizonCounts.annual
        ? planningHorizonCounts.monthly > planningHorizonCounts.annual ? "monthly" : "annual"
        : undefined;
      await this.dependencies.memory.rememberConversationalMemory(request.userId, {
        category: "financial_pattern",
        key,
        value: `Has chosen the ${targetChoice.horizon} planning target when directing an employer-covered recurring expense toward savings.`,
        evidence,
        confidence: 0.9,
        sourceType: "system_inference",
        sourceMetadata: {
          memoryKind: "observed_behavior",
          behavior: "redirect_covered_recurring_expense_to_savings",
          observationCount,
          lastPlanningHorizon: targetChoice.horizon,
          planningHorizonCounts,
          ...(moreOftenChosen ? { moreOftenChosen } : {}),
          cadence: coveredSpend.cadence
        },
        ...(previous ? { supersedesId: previous.id } : {})
      });
    } catch {
      // Memory is best-effort and cannot change the confirmed ledger outcome.
    }
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

    const nextActionId = this.nextId("savings_action", this.nextActionNumber++);
    const amountCents = pendingDecision.suggestion?.amountCents ?? proposal.suggestion.amountCents;
    const message = `I can record ${formatUsd(amountCents)} in your mocked Victoria savings ledger toward ${goalName}. Please confirm: should I record it? No real money has moved yet.`;
    const updatedProposal: SavingsProposal = {
      ...proposal,
      id: this.nextId("proposal", this.nextProposalNumber++),
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
          id: this.nextId("proposal_transition", this.nextProposalTransitionNumber++),
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
      id: this.nextId("suggestion", this.nextProposalNumber),
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
      id: this.nextId("proposal_transition", this.nextProposalTransitionNumber++),
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
    const actionSequence = this.nextGoalAllocationNumber++;
    const actionId = this.nextId("goal_allocation_action", actionSequence);
    const goalAllocation: PendingSavingsGoalAllocation = {
      id: this.nextId("goal_allocation_proposal", actionSequence),
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
    const actionId = this.nextId("savings_action", this.nextActionNumber++);
    const proposal: SavingsProposal = {
      id: this.nextId("proposal", this.nextProposalNumber++),
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
        : (suggestion.source === "merchant_history" || suggestion.source === "transaction_history") && classification.merchantName
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
      id: this.nextId("event", this.nextEventNumber++),
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
      id: this.dependencies.pendingSavingsActions
        ? `approval_${approvedActionIdForEntry}`
        : this.nextId("approval", this.nextApprovalNumber++),
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
    await this.rememberCoveredRecurringAllocationBehavior(request, trustedEvent);
    const recorded = transitionSavingsProposal(trustedProposal, {
      id: this.nextId("proposal_transition", this.nextProposalTransitionNumber++),
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
      approvalId = `approval_${actionId}`;
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
      const replacementSequence = this.nextGoalAllocationNumber++;
      const replacementActionId = this.nextId("goal_allocation_action", replacementSequence);
      const replacementAllocation: PendingSavingsGoalAllocation = {
        ...allocation,
        id: this.nextId("goal_allocation_proposal", replacementSequence),
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
      id: this.nextId("goal_approval", this.nextGoalApprovalNumber++),
      userId: request.userId,
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

  private async getPendingAmountClarification(request: AgentRequest): Promise<PendingAmountClarification | undefined> {
    const store = this.dependencies.pendingAmountClarifications;
    if (store) {
      const pending = await store.get(request.userId, request.conversationId ?? "default");
      return pending?.classification.type === "avoided_spend" && pending.savingsEvent.type === "avoided_spend" &&
        pending.savingsEvent.userId === request.userId ? pending : undefined;
    }
    const local = this.pendingAmountClarifications.get(this.conversationKey(request));
    return local?.userId === request.userId
      ? { classification: local.classification, savingsEvent: local.savingsEvent }
      : undefined;
  }

  private async setPendingAmountClarification(
    request: AgentRequest,
    value: PendingAmountClarification
  ): Promise<void> {
    const store = this.dependencies.pendingAmountClarifications;
    if (store) {
      await store.set(request.userId, request.conversationId ?? "default", value);
      return;
    }
    this.pendingAmountClarifications.set(this.conversationKey(request), { userId: request.userId, ...value });
  }

  private async clearPendingAmountClarification(request: AgentRequest): Promise<void> {
    const store = this.dependencies.pendingAmountClarifications;
    if (store) {
      await store.clear(request.userId, request.conversationId ?? "default");
      return;
    }
    this.pendingAmountClarifications.delete(this.conversationKey(request));
  }

  private async restorePendingSavingsAction(request: AgentRequest): Promise<void> {
    const store = this.dependencies.pendingSavingsActions;
    if (!store) return;
    const pending = await store.getPending(request.userId, request.conversationId ?? "default");
    if (!pending) return;
    const { decision } = pending;
    if (
      pending.actionId !== decision.toolCall?.actionId ||
      decision.toolCall.name !== "createSavingsEntry" ||
      decision.proposal?.status !== "pending" ||
      decision.proposal.actionId !== pending.actionId ||
      decision.proposal.userId !== request.userId ||
      decision.savingsEvent?.userId !== request.userId ||
      (decision.planningChoice !== undefined && !isValidRestoredPlanningChoice(decision))
    ) return;
    const conversationKey = this.conversationKey(request);
    this.pendingSavingsActions.set(pending.actionId, {
      userId: request.userId,
      conversationKey,
      decision: pending.decision,
      ...(pending.awaitingValidRevision ? { awaitingValidRevision: true } : {}),
      ...(pending.awaitingRevisionTarget ? { awaitingRevisionTarget: true } : {})
    });
    this.pendingActionIdsByConversation.set(conversationKey, pending.actionId);
  }

  private async restorePendingGoalAllocationAction(request: AgentRequest): Promise<void> {
    const store = this.dependencies.pendingGoalAllocationActions;
    if (!store) return;
    const pending = await store.getPending(request.userId, request.conversationId ?? "default");
    if (!pending) return;
    const { decision } = pending;
    if (
      pending.actionId !== decision.toolCall?.actionId ||
      decision.toolCall.name !== "createSavingsGoalAllocation" ||
      decision.goalAllocation?.status !== "pending" ||
      decision.goalAllocation.userId !== request.userId
    ) return;
    const conversationKey = this.conversationKey(request);
    this.pendingGoalAllocationActions.set(pending.actionId, {
      userId: request.userId,
      conversationKey,
      decision: pending.decision,
      ...(pending.approval ? { approval: pending.approval } : {})
    });
    this.pendingGoalAllocationIdsByConversation.set(conversationKey, pending.actionId);
  }

  private async restorePendingEntryCorrection(request: AgentRequest): Promise<void> {
    const store = this.dependencies.pendingEntryCorrections;
    if (!store) return;
    const pending = await store.getPending(request.userId, request.conversationId ?? "default");
    if (!pending) return;
    const decision = pending.decision;
    if (pending.actionId !== decision.toolCall?.actionId ||
        decision.toolCall.name !== "createSavingsEntryCorrection" ||
        !decision.entryCorrection || !("status" in decision.entryCorrection) ||
        decision.entryCorrection.status !== "pending" || decision.entryCorrection.userId !== request.userId) return;
    const conversationKey = this.conversationKey(request);
    this.pendingEntryCorrections.set(pending.actionId, {
      userId: request.userId, conversationKey, decision
    });
    this.pendingEntryCorrectionIdsByConversation.set(conversationKey, pending.actionId);
  }

  private async persistPendingSavingsAction(request: AgentRequest, responseDecision: AgentDecision): Promise<void> {
    const store = this.dependencies.pendingSavingsActions;
    if (!store) return;
    const conversationKey = this.conversationKey(request);
    const actionId = this.pendingActionIdsByConversation.get(conversationKey);
    const pending = actionId ? this.pendingSavingsActions.get(actionId) : undefined;
    await store.commit({
      userId: request.userId,
      conversationId: request.conversationId ?? "default",
      ...(pending ? { pendingAction: {
        actionId: actionId!,
        decision: pending.decision,
        ...(pending.awaitingValidRevision ? { awaitingValidRevision: true } : {}),
        ...(pending.awaitingRevisionTarget ? { awaitingRevisionTarget: true } : {})
      } } : {}),
      responseDecision
    });
  }

  private async persistPendingGoalAllocationAction(
    request: AgentRequest,
    responseDecision: AgentDecision,
    priorActionId?: string,
    priorDecision?: AgentDecision
  ): Promise<void> {
    const store = this.dependencies.pendingGoalAllocationActions;
    if (!store) return;
    const conversationKey = this.conversationKey(request);
    const actionId = this.pendingGoalAllocationIdsByConversation.get(conversationKey);
    const pending = actionId ? this.pendingGoalAllocationActions.get(actionId) : undefined;
    let terminalAction: { actionId: string; status: "recorded" | "declined" | "superseded" } | undefined;
    if (responseDecision.action === "record_goal_allocation") {
      if (responseDecision.goalAllocation?.status === "recorded") {
        terminalAction = { actionId: responseDecision.goalAllocation.approvedActionId, status: "recorded" };
      }
    } else if (pending && priorActionId && priorActionId !== actionId) {
      terminalAction = { actionId: priorActionId, status: "superseded" };
    } else if (priorActionId && isPendingGoalRetargetRequest(request.message)) {
      terminalAction = { actionId: priorActionId, status: "superseded" };
    } else if (priorActionId && priorDecision?.goalAllocation &&
      interpretApprovalResponse(request.message, priorDecision.goalAllocation.amountCents) === "explicit_decline") {
      terminalAction = { actionId: priorActionId, status: "declined" };
    }
    await store.commit({
      userId: request.userId,
      conversationId: request.conversationId ?? "default",
      ...(responseDecision.goalAllocation?.status === "recorded" ? {
        approvalAction: {
          actionId: responseDecision.goalAllocation.approvedActionId,
          approval: responseDecision.goalAllocation.approval
        }
      } : {}),
      ...(pending && actionId ? {
        pendingAction: {
          actionId,
          decision: pending.decision,
          ...(pending.approval ? { approval: pending.approval } : {})
        }
      } : {}),
      ...(terminalAction ? { terminalAction } : {})
    });
  }

  private async persistPendingEntryCorrection(
    request: AgentRequest,
    responseDecision: AgentDecision,
    priorActionId?: string,
    priorDecision?: AgentDecision
  ): Promise<void> {
    const store = this.dependencies.pendingEntryCorrections;
    if (!store) return;
    const conversationKey = this.conversationKey(request);
    const actionId = this.pendingEntryCorrectionIdsByConversation.get(conversationKey);
    const pending = actionId ? this.pendingEntryCorrections.get(actionId) : undefined;
    let terminalAction: { actionId: string; status: "recorded" | "declined" | "superseded" } | undefined;
    if (responseDecision.entryCorrection && !("status" in responseDecision.entryCorrection)) {
      terminalAction = { actionId: responseDecision.entryCorrection.approvedActionId, status: "recorded" };
    } else if (priorActionId && isPendingCorrectionReplacementRequest(request.message)) {
      terminalAction = { actionId: priorActionId, status: "superseded" };
    } else if (priorActionId && priorDecision?.entryCorrection && "status" in priorDecision.entryCorrection &&
        priorDecision.entryCorrection.status === "pending" &&
        interpretApprovalResponse(request.message, priorDecision.entryCorrection.correctedAmountCents) === "explicit_decline") {
      terminalAction = { actionId: priorActionId, status: "declined" };
    }
    await store.commit({
      userId: request.userId,
      conversationId: request.conversationId ?? "default",
      ...(pending && actionId ? { pendingAction: {
        actionId, decision: pending.decision
      } } : {}),
      ...(terminalAction ? { terminalAction } : {})
    });
  }

  private nextId(namespace: string, sequence: number): string {
    return this.dependencies.idFactory
      ? `${namespace}_${this.dependencies.idFactory()}_${sequence}`
      : `${namespace}_${sequence}`;
  }
}

function personalizeOrdinaryReply(
  memory: Awaited<ReturnType<MemoryProvider["getMemoryForUser"]>>,
  fallbackMessage: string,
  userMessage: string,
  interestOnly = false
): string | undefined {
  const memories = memory.conversationalMemories ?? [];
  const inactiveInterests = new Set(memories
    .filter((item) => item.key.startsWith("interest:") && item.sourceMetadata?.interestStatus === "inactive")
    .map((item) => memoryTopicLabel(item.key)));
  const spendingQuestion = isSpendingQuestion(userMessage);
  const matchingInterestContext = memories.find((item) => item.key.startsWith("interest:") &&
    item.sourceMetadata?.interestStatus !== "inactive" && isMemoryTopicMatched(item, userMessage) &&
    (spendingQuestion || interestUseContext(item.key, userMessage, item.semanticSimilarity) !== undefined));
  const matchingActivitySpend = spendingQuestion ? memories.find((item) =>
    (item.key.startsWith("interest_spend:") || item.key.startsWith("financial_profile:category:") ||
      item.key.startsWith("activity_mapping:")) &&
    !inactiveInterests.has(memoryTopicLabel(item.key)) && isMemoryTopicMatched(item, userMessage)) : undefined;
  const matchingContext = matchingInterestContext ?? matchingActivitySpend;
  if (matchingContext) {
    const activity = memoryTopicLabel(matchingContext.key);
    if (!activity) return undefined;
    if (spendingQuestion) {
      const reportedSpend = memories.find((item) => item.key.startsWith("interest_spend:") &&
        memoryTopicLabel(item.key) === activity);
      let reportedSpendSummary: string | undefined;
      if (reportedSpend) {
        const amount = reportedSpend.value.match(/\$[\d,]+\.\d{2}/)?.[0];
        const cadence = typeof reportedSpend.sourceMetadata?.cadence === "string"
          ? reportedSpend.sourceMetadata.cadence
          : reportedSpend.value.match(/\bper (day|week|month|year|session|visit|class|trip)\b/i)?.[1]?.toLocaleLowerCase("en-US");
        if (amount && cadence) {
          reportedSpendSummary = `You told me you spend about ${amount} per ${cadence} on ${activity} (last noted ${formatMemoryDate(reportedSpend.createdAt)})`;
        }
      }
      const mapping = memories.find((item) => item.key === `activity_mapping:${activity}` &&
        item.sourceType === "user_statement" && typeof item.sourceMetadata?.profileKey === "string");
      const profileKey = typeof mapping?.sourceMetadata?.profileKey === "string"
        ? mapping.sourceMetadata.profileKey
        : `financial_profile:category:${activity}`;
      const profileSpend = memories.find((item) => item.key === profileKey &&
        item.sourceType === "plaid_transaction_profile");
      const totalCents = profileSpend?.sourceMetadata?.totalCents;
      const recordCount = profileSpend?.sourceRecordCount;
      if (profileSpend && Number.isSafeInteger(totalCents) && Number.isSafeInteger(recordCount) &&
          profileSpend.observedFrom && profileSpend.observedThrough) {
        if (mapping) {
          const mappedTarget = typeof mapping.sourceMetadata?.target === "string" ? mapping.sourceMetadata.target : activity;
          const dimension = mapping.sourceMetadata?.dimension === "merchant" ? "merchant" : "category";
          const userReported = reportedSpendSummary ? `${reportedSpendSummary}. Separately, ` : "";
          const mappingSummary = reportedSpendSummary
            ? `you told me to use ${mappedTarget} as the ${dimension} for ${activity}. `
            : `You told me to use ${mappedTarget} as the ${dimension} for ${activity}. `;
          return `${userReported}${mappingSummary}Your linked transactions show ${formatUsd(totalCents as number)} across ${recordCount} posted purchases for ${mappedTarget}, from ${profileSpend.observedFrom} through ${profileSpend.observedThrough}; that history may not reflect current spending. Is that mapping still right?`;
        }
        const userReported = reportedSpendSummary ? `${reportedSpendSummary}. Separately, ` : "";
        return `${userReported}${reportedSpendSummary ? "your linked" : "Your linked"} transactions show ${formatUsd(totalCents as number)} across ${recordCount} posted purchases categorized as ${activity}, from ${profileSpend.observedFrom} through ${profileSpend.observedThrough}; that history may not reflect current spending. Is that category a good match for your ${activity} spending?`;
      }
      if (reportedSpendSummary) return `${reportedSpendSummary}. Is that still accurate?`;
      if (mapping) {
        const target = typeof mapping.sourceMetadata?.target === "string" ? mapping.sourceMetadata.target : "that transaction label";
        return `You told me to use ${target} for ${activity}, but I don't have a current linked transaction summary for it. If you'd like, tell me what you typically spend per month or per outing, and I'll keep that user-reported estimate separate.`;
      }
      return `I remember ${activity} is something you enjoy, but I don't have a reliable spend amount for it. If you'd like to use linked transactions, tell me which category or merchant represents ${activity}; otherwise, tell me what you typically spend per month or per outing. I'll keep those sources separate.`;
    }
    const useContext = interestUseContext(matchingContext.key, userMessage, matchingContext.semanticSimilarity);
    if (useContext === "planning") {
      return `I remember you enjoy ${activity}. If you're planning around it, we can include ${activity} in the plan. Is that still something you enjoy?`;
    }
    if (useContext === "routine") {
      return `I remember you enjoy ${activity}. We can look for a manageable way to make time for it in your routine. Is that still something you enjoy?`;
    }
    if (useContext === "goal") {
      return `I remember you enjoy ${activity}. If this goal still includes ${activity}, we can keep that in mind as we plan. Is that still something you enjoy?`;
    }
    if (useContext === "spending") {
      return `I remember you enjoy ${activity}. We can include it in this spending discussion, but I don't know what it costs for you. Which expense are you weighing? Is that still something you enjoy?`;
    }
    return `I remember you enjoy ${activity}. Is that still something you enjoy?`;
  }

  if (spendingQuestion) {
    const activity = extractSpendingTopic(userMessage);
    return activity
      ? `I don't have a reliable amount for ${activity} yet. What do you typically spend per month or per outing? If you'd rather use linked transactions, tell me which category or merchant represents ${activity}, and I'll keep that source separate from your estimate.`
      : "I don't have enough detail to identify the activity or a reliable amount. Which activity do you mean, and what do you typically spend per month or per outing? If you'd rather use linked transactions, tell me the category or merchant to check.";
  }

  if (interestOnly) return undefined;

  const routine = memories.find((item) => isRelevantRecurringRoutine(item, userMessage));
  if (routine) {
    const routineName = describeRecurringRoutine(routine.key);
    if (routineName) {
      return `I remember you’ve mentioned your ${routineName} routine. We can think through what would feel manageable this time. What’s been making it difficult?`;
    }
  }

  const goal = memories.find((item) => item.category === "goal" &&
    (item.key === "emergency_fund" || item.key.startsWith("goal:")));
  if (goal) {
    const target = goal.key === "emergency_fund"
      ? "an emergency fund"
      : formatRememberedGoalTarget(goal.key.slice("goal:".length));
    if (target) {
      return `I’m here with you. You’ve mentioned saving for ${target}; we can keep that in mind as we talk this through. What feels most important right now?`;
    }
  }

  const preference = memories.find((item) => item.category === "preference");
  if (preference) {
    const preferredApproach = preference.key.startsWith("preference:")
      ? preference.key.slice("preference:".length).replace(/_/g, " ").replace(/[^a-z0-9 '$.,&-]/gi, "").trim().slice(0, 60)
      : preference.evidence.match(/\bi\s+(?:would\s+|’d\s+)?prefer\s+(?:a\s+|an\s+|the\s+)?([^.!?]+)/i)?.[1]
        ?? preference.evidence.match(/\b([a-z][^,.!?]{1,50}?)\s+(?:is|are)\s+easier\s+for\s+me\b/i)?.[1]
          ?.replace(/^.*\bso\s+/i, "")
        ?? (preference.sourceType === "user_correction"
          ? preference.value.match(/^prefers?\s+(?:a\s+|an\s+|the\s+)?([^.!?]+)/i)?.[1]
          : undefined);
    const safePreferredApproach = preferredApproach
      ?.replace(/[^a-z0-9 '$.,&-]/gi, "").trim().slice(0, 60);
    if (safePreferredApproach) {
      return `I’ll keep your preference for ${safePreferredApproach} in mind. What would be most helpful right now?`;
    }
  }

  const episode = memories.find((item) => isUsableEpisodicSummary(item, userMessage));
  return episode
    ? `I have a note from an earlier conversation: “${episode.value}” Is that still relevant, or has something changed?`
    : fallbackMessage;
}

function isSpendingQuestion(message: string): boolean {
  return /\b(?:how much|what do i spend|what's my spend|what is my spend|cost|budget|spend(?:ing)?|spent)\b/i.test(message);
}

function interestUseContext(
  interestKey: string,
  message: string,
  semanticSimilarity?: number
): "planning" | "routine" | "goal" | "spending" | undefined {
  const topic = memoryTopicLabel(interestKey);
  if (!topic || !(isMemoryTopicMentioned(interestKey, message) || isStrongSemanticMatch(semanticSimilarity))) return undefined;
  const normalized = message.toLocaleLowerCase("en-US");
  const topicText = topic.toLocaleLowerCase("en-US");
  const topicIndex = normalized.indexOf(topicText);
  const nearby = topicIndex < 0
    ? normalized
    : normalized.slice(Math.max(0, topicIndex - 48), Math.min(normalized.length, topicIndex + topicText.length + 48));
  if (/\b(?:plan(?:ning)?|trip|vacation|itinerary|weekend|activities)\b/.test(nearby)) return "planning";
  if (/\b(?:routine|schedule|make time|fit|practice|weekly|every week|regularly|do more|keep up)\b/.test(nearby)) return "routine";
  if (/\b(?:budget(?:ing)?|costs?|spending|spend|expense|price|gear|equipment|class|lesson|fee)\b/.test(nearby)) return "spending";
  if (/\b(?:goal|aim|aiming|working toward|trying to|want to|hope to)\b/.test(nearby)) return "goal";
  return undefined;
}

function memoryTopicLabel(key: string): string | undefined {
  const topic = key.startsWith("interest_spend:")
    ? key.slice("interest_spend:".length)
    : key.startsWith("interest:")
      ? key.slice("interest:".length)
      : key.startsWith("activity_mapping:")
        ? key.slice("activity_mapping:".length)
      : key.startsWith("financial_profile:category:")
        ? key.slice("financial_profile:category:".length)
        : "";
  return topic ? topic.replace(/_/g, " ") : undefined;
}

function extractSpendingTopic(message: string): string | undefined {
  const match = /\b(?:spend|spending|spent|budget|cost)\s+(?:on|for|in)\s+([^?.!,;]{1,80})/i.exec(message);
  const topic = match?.[1]?.trim().replace(/\b(?:usually|typically|per month|per outing|each month)\b.*$/i, "").trim();
  return topic ? topic.replace(/\b[a-z]/g, (letter) => letter.toLocaleUpperCase("en-US")) : undefined;
}

function formatMemoryDate(createdAt: string): string {
  const date = new Date(createdAt);
  return Number.isFinite(date.getTime()) ? date.toISOString().slice(0, 10) : "date unavailable";
}

function isMemoryTopicMentioned(key: string, message: string): boolean {
  const topic = memoryTopicLabel(key);
  if (!topic) return false;
  const normalize = (value: string) => `_${value.toLocaleLowerCase("en-US").replace(/[^a-z0-9]+/g, "_").replace(/^_|_$/g, "")}_`;
  const normalizedMessage = normalize(message);
  if (normalizedMessage.includes(normalize(topic))) return true;
  return (INTEREST_TOPIC_ALIASES[topic] ?? []).some((alias) => normalizedMessage.includes(normalize(alias)));
}

const INTEREST_TOPIC_ALIASES: Readonly<Record<string, readonly string[]>> = {
  bird_watching: ["birdwatching", "birding"],
  cycling: ["biking", "bike riding"],
  hiking: ["hike", "hikes", "trail walking", "trekking"],
  running: ["run", "jogging", "jog"],
  strength_training: ["weight training", "lifting", "weightlifting"],
  video_games: ["gaming", "video gaming"]
};

function isMemoryTopicMatched(memory: ConversationalMemory, message: string): boolean {
  return isMemoryTopicMentioned(memory.key, message) || isStrongSemanticMatch(memory.semanticSimilarity);
}

function isStrongSemanticMatch(similarity: number | undefined): boolean {
  return Number.isFinite(similarity) && (similarity as number) >= SEMANTIC_MEMORY_RECALL_MIN_SIMILARITY;
}

function normalizeRoutineTerm(term: string): string {
  return term.length > 4 ? term.replace(/s$/, "") : term;
}

const ROUTINE_STOP_WORDS = new Set([
  "usually", "often", "typically", "routinely", "regularly", "every", "each", "weekdays", "weekday",
  "weekends", "weekend", "during", "before", "after", "from", "with", "your", "have", "make"
]);

function isRelevantRecurringRoutine(
  memory: import("./memory/types.js").ConversationalMemory,
  userMessage: string
): boolean {
  if (memory.category !== "habit") return false;
  const message = userMessage.toLocaleLowerCase("en-US");
  if (memory.key === "coffee_routine") return /\b(?:coffee|cafe|café)\b/i.test(message);
  if (memory.key === "takeout_routine") return /\b(?:takeout|delivery|doordash|ordering food|order food)\b/i.test(message);
  if (memory.key.startsWith("merchant_habit:")) {
    const merchantWords = memory.key.slice("merchant_habit:".length).replace(/_/g, " ").trim();
    if (merchantWords && message.includes(merchantWords)) return true;
    const evidenceTerms = new Set((memory.evidence ?? "").toLocaleLowerCase("en-US")
      .match(/[a-z]{4,}/g)?.map(normalizeRoutineTerm).filter((term) => !ROUTINE_STOP_WORDS.has(term)) ?? []);
    const messageTerms = new Set(message.match(/[a-z]{4,}/g)?.map(normalizeRoutineTerm) ?? []);
    const matchingTerms = [...evidenceTerms].filter((term) => messageTerms.has(term));
    return matchingTerms.length >= 2;
  }
  return false;
}

function selectPersonalizationMemories(
  memories: readonly ConversationalMemory[],
  userMessage: string,
  conversationContext: readonly string[]
): readonly Pick<ConversationalMemory, "id" | "category" | "key" | "value">[] {
  const eligible = memories.filter((memory) => {
    if (memory.category !== "preference" && memory.category !== "goal" && memory.category !== "habit" &&
        !(memory.category === "other" && memory.key.startsWith("interest:"))) return false;
    return isRetrievableMemory(memory);
  });
  return planMemoryRetrieval({
    memories: eligible,
    query: userMessage,
    additionalContext: conversationContext.slice(-6).join(" "),
    limit: 6,
    alwaysRelevant: isCommunicationStylePreference,
    alwaysRelevantLimit: 2,
    categoryLimits: { preference: 2, goal: 2, habit: 2, other: 2, financial_pattern: 2 }
  }).map(({ id, category, key, value }) => ({ id, category, key, value }));
}

function isCommunicationStylePreference(memory: ConversationalMemory): boolean {
  const text = `${memory.key} ${memory.value} ${memory.evidence}`.toLocaleLowerCase("en-US");
  return memory.category === "preference" &&
    /\b(?:reply|replies|response|responses|answer|answers|explanation|explanations|tone|detail|detailed|brief|briefly|concise|short|step by step|one question|practical|direct|gentle|encouraging|no emojis)\b/i.test(text);
}

function sanitizeMemoryEvidence(value: string): string {
  return value.replace(/[\u0000-\u001f\u007f-\u009f]/g, " ").replace(/\s+/g, " ").trim().slice(0, 120);
}

function describeRecurringRoutine(key: string): string | undefined {
  if (key === "coffee_routine") return "coffee";
  if (key === "takeout_routine") return "takeout";
  if (!key.startsWith("merchant_habit:")) return undefined;
  const merchant = key.slice("merchant_habit:".length).replace(/_/g, " ").trim();
  if (!merchant) return undefined;
  const brandNames: Readonly<Record<string, string>> = {
    doordash: "DoorDash",
    blue_bottle: "Blue Bottle",
    starbucks: "Starbucks"
  };
  return brandNames[merchant] ?? merchant.replace(/\b[a-z]/g, (letter) => letter.toLocaleUpperCase("en-US"));
}

function formatRememberedGoalTarget(key: string): string {
  const target = key.replace(/_/g, " ").replace(/[^a-z0-9 '&-]/gi, "").trim().slice(0, 60);
  const tripDestination = /^trip\s+(.+)$/i.exec(target)?.[1];
  if (tripDestination) {
    return `a trip to ${tripDestination.replace(/\b[a-z]/g, (letter) => letter.toLocaleUpperCase("en-US"))}`;
  }
  return target;
}

function findFinancialMemoryMentionedIn(
  assistantMessage: string,
  memories: readonly import("./memory/types.js").ConversationalMemory[]
): import("./memory/types.js").ConversationalMemory | undefined {
  const normalizedMessage = assistantMessage.toLocaleLowerCase("en-US");
  const stopWords = new Set(["financial", "profile", "merchant", "category", "spend", "spent", "purchase", "purchases",
    "transaction", "transactions", "typical", "usually", "recorded", "posted", "usd", "with", "from", "that", "your", "the", "for"]);
  const scored = memories
    .filter((memory) => memory.category === "financial_pattern" || (memory.category === "habit" && memory.key.startsWith("merchant_spend:")))
    .map((memory) => {
      const searchable = `${memory.key.replace(/[:_]/g, " ")} ${memory.value}`.toLocaleLowerCase("en-US");
      const terms = [...new Set(searchable.match(/[a-z0-9]{3,}/g) ?? [])].filter((term) => !stopWords.has(term));
      const score = terms.filter((term) => normalizedMessage.includes(term)).length;
      return { memory, score };
    })
    .filter((item) => item.score > 0)
    .sort((left, right) => right.score - left.score);
  const top = scored[0];
  if (!top) return undefined;
  if (scored[1]?.score === top.score) return undefined;
  return top.memory;
}

function isMateriallyDifferentSpend(transactionAmountCents: number, statedAmountCents: number): boolean {
  const toleranceCents = Math.max(100, Math.round(statedAmountCents * 0.15));
  return Math.abs(transactionAmountCents - statedAmountCents) >= toleranceCents;
}

function isEpisodicSummaryEligible(message: string): boolean {
  return message.length <= 1_000 &&
    !/(?:\$\s*\d|\b(?:spent|paid|bought|charged|transaction|account number|card number|password|social security|ssn|pin number|diagnos(?:is|ed)|diabetes|cancer|medication|prescription|mental health|therapy|medical|political|religious|sexuality|race|ethnicity|immigration|visa status)\b)/i.test(message);
}

function isTeamSupportedClassification(classification: ClassifiedMessage): boolean {
  if (classification.type === "avoided_spend" || classification.type === "regretful_spend") return true;
  if (classification.type === "unclear" && classification.uncertainIntent) return false;
  // A bare unclear message can benefit from specialist clarification. When an
  // amount is present, let the core clarification-resolution path handle it.
  return classification.type === "unclear" && classification.amountCents === undefined;
}

function isSimpleAmountReply(message: string): boolean {
  return /^\s*(?:(?:it's|its|about|around|the amount is|that is|use|make it|set it to)\s*)?\$\s*\d[\d,]*(?:\.\d{1,2})?\s*[.!?]*\s*$/i.test(message);
}

function questionAfterDecline(message: string): string | undefined {
  const match = message.match(/^[^.!?]+[.!?]\s*(.+\?)\s*$/s);
  return match?.[1]?.trim();
}

function isCurrentMonthRecordRequest(message: string): boolean {
  return /\b(?:record|log|save|add)\b/i.test(message) &&
    /\b(?:this|current)\s+month\b/i.test(message);
}

function answerRecurringProjectionQuestion(
  message: string,
  monthlyAmount: number | undefined,
  pendingAmount?: number
): string | undefined {
  if (!/\b(?:annual|annually|year|yearly|12\s+months|twelve\s+months)\b/i.test(message) ||
      !/\b(?:what|how|calculate|show|tell|answer|project|projection|math|add up|total)\b/i.test(message)) return;
  if (!monthlyAmount || (pendingAmount !== undefined && pendingAmount !== monthlyAmount) ||
      !Number.isSafeInteger(monthlyAmount * 12)) return;
  const statedAmount = parseExplicitDollarAmount(message);
  if (statedAmount.status === "valid" && statedAmount.amountCents !== monthlyAmount &&
      statedAmount.amountCents !== monthlyAmount * 12) return;
  return `${formatUsd(monthlyAmount)} a month would be ${formatUsd(annualizeMonthlyAmountCents(monthlyAmount))} over 12 months if that expense stays out of your budget each month. This is a planning projection, not an amount already saved.`;
}

function describeAnnualProjection(projection: {
  monthlyAmountCents: number;
  annualAmountCents: number;
  eventCount: number;
}): string {
  const subject = projection.eventCount === 2 ? "Together, those two stated costs" : "That stated cost";
  return `${subject} would be ${formatUsd(projection.monthlyAmountCents)} a month, or ${formatUsd(projection.annualAmountCents)} over 12 months if the costs stay out of your budget. This is a planning projection, not an amount already saved.`;
}

function describeCombinedProjectionAndClarifyRecordTarget(
  projection: NonNullable<ReturnType<typeof buildTurnContext>["annualProjection"]>,
  costs?: TurnContext["recurringCosts"],
  pendingAmountCents?: number
): string {
  const amounts = costs?.map((cost) => formatUsd(cost.monthlyAmountCents));
  const targetQuestion = amounts?.length === 2
    ? `Which single monthly cost do you mean for a savings suggestion: ${amounts[0]} or ${amounts[1]}? If those amounts are the same, please name the cost.`
    : "Which specific monthly cost do you mean for a savings suggestion? Please identify the cost and amount.";
  const pendingNote = pendingAmountCents === undefined
    ? "I haven't created a proposal or recorded anything."
    : ` The existing ${formatUsd(pendingAmountCents)} suggestion remains pending; nothing has been recorded.`;
  return `Together, those two costs are ${formatUsd(projection.monthlyAmountCents)} a month, or ${formatUsd(projection.annualAmountCents)} over 12 months if both stay out of your budget. ${targetQuestion}${pendingNote}`;
}

function answerBufferQuestion(message: string, amountCents: number | undefined): string | undefined {
  if (amountCents === undefined || !/\b(?:buffer|cushion|emergency fund)\b/i.test(message) ||
      !/\b(?:whether|should|make sense|sensible|good idea|recommend)\b/i.test(message)) return;
  return `Keeping the ${formatUsd(amountCents)} as a buffer could make sense if it helps cover upcoming needs and you can leave it out of day-to-day spending. That is a planning choice; nothing has been recorded.`;
}

function getPriorCoveredExpenseAllocation(memories: readonly ConversationalMemory[]): {
  priorCoveredExpenseAllocation?: {
    lastPlanningHorizon: "monthly" | "annual";
    observationCount: number;
    moreOftenChosen?: "monthly" | "annual";
  };
} {
  const memory = [...memories].reverse().find((item) =>
    item.category === "financial_pattern" &&
    item.key === "observed_behavior:covered_recurring_expense_to_savings" &&
    item.sourceMetadata?.memoryKind === "observed_behavior" &&
    (item.sourceMetadata.lastPlanningHorizon === "monthly" || item.sourceMetadata.lastPlanningHorizon === "annual"));
  if (!memory) return {};
  const metadata = memory.sourceMetadata;
  if (!metadata) return {};
  const lastPlanningHorizon = metadata.lastPlanningHorizon;
  if (lastPlanningHorizon !== "monthly" && lastPlanningHorizon !== "annual") return {};
  const counts = readPlanningHorizonCounts(metadata.planningHorizonCounts);
  const observationCount = Number.isSafeInteger(metadata.observationCount)
    ? metadata.observationCount as number
    : counts.monthly + counts.annual;
  const moreOftenChosen = observationCount >= 2 && counts.monthly !== counts.annual
    ? counts.monthly > counts.annual ? "monthly" : "annual"
    : undefined;
  return {
    priorCoveredExpenseAllocation: {
      lastPlanningHorizon,
      observationCount,
      ...(moreOftenChosen ? { moreOftenChosen } : {})
    }
  };
}

function readPlanningHorizonCounts(value: unknown): { monthly: number; annual: number } {
  if (!value || typeof value !== "object") return { monthly: 0, annual: 0 };
  const counts = value as { monthly?: unknown; annual?: unknown };
  return {
    monthly: typeof counts.monthly === "number" && Number.isSafeInteger(counts.monthly) && counts.monthly >= 0
      ? counts.monthly : 0,
    annual: typeof counts.annual === "number" && Number.isSafeInteger(counts.annual) && counts.annual >= 0
      ? counts.annual : 0
  };
}

function getPriorCoveredSpendProjection(conversationContext: readonly string[]): {
  validatedMonthlyAmountCents?: number;
  validatedAnnualProjectionCents?: number;
} {
  const coveredSpend = [...conversationContext].reverse()
    .map(freedRecurringSpend)
    .find((spend) => spend?.cadence === "month");
  if (!coveredSpend || !Number.isSafeInteger(coveredSpend.amountCents * 12)) return {};
  return {
    validatedMonthlyAmountCents: coveredSpend.amountCents,
    validatedAnnualProjectionCents: annualizeMonthlyAmountCents(coveredSpend.amountCents)
  };
}

function conversationResponderMemories(
  memories: readonly ConversationalMemory[],
  financialContext: VictoriaConversationContext | undefined,
  query?: string
): readonly ConversationResponderMemory[] {
  if (financialContext) {
    const selected = financialContext.selectedMemoryFacts.map(({ id, key, value, provenance }) => ({ id, key, value, provenance }));
    const selectedIds = new Set(selected.map((memory) => memory.id));
    // Context retrieval is focused on financial facts. Preserve other relevant
    // memories returned for the current message so a newly learned preference
    // or interest can ground a read-only answer on this same turn.
    const relevantMemories = query ? planMemoryRetrieval({
      memories: memories.filter(isRetrievableMemory), query, limit: 6,
      categoryLimits: { preference: 2, goal: 2, habit: 2, other: 2, financial_pattern: 2 }
    }) : memories.filter(isRetrievableMemory);
    for (const memory of relevantMemories) {
      if (selectedIds.has(memory.id)) continue;
      selected.push({ id: memory.id, key: memory.key, value: memory.value,
        provenance: memory.sourceType === "user_correction" ? "user_correction" : "user_statement" });
    }
    return selected.slice(0, 6);
  }
  return memories.map(({ id, key, value, confidence, sourceType }) => ({
    id, key, value, confidence, ...(sourceType ? { sourceType } : {})
  }));
}

function withoutConversationEventHistory(context: VictoriaConversationContext): VictoriaConversationContext {
  return {
    relevantUserTurns: context.relevantUserTurns,
    financialFacts: context.financialFacts,
    selectedMemoryFacts: context.selectedMemoryFacts,
    conversationSavingsEvents: [],
    ...(context.workflowState ? { workflowState: context.workflowState } : {})
  };
}

function conversationResponsePreference(
  memories: readonly ConversationalMemory[]
): ConversationResponderInput["responsePreference"] {
  const preferences = memories.filter((memory) => isRetrievableMemory(memory) && memory.category === "preference" &&
    /^(?:communication:brief|communication:detailed|response_style)$/i.test(memory.key));
  const current = preferences.sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  if (!current) return undefined;
  const statement = `${current.key} ${current.value} ${current.evidence}`.toLocaleLowerCase("en-US");
  if (/\b(?:brief|briefly|concise|short replies|short check-ins)\b/.test(statement)) return "brief";
  if (/\b(?:detailed|in-depth|thorough|more explanation|longer replies)\b/.test(statement)) return "detailed";
  return undefined;
}

function selectConversationEpisodeSummaries(
  memories: readonly ConversationalMemory[],
  message: string
): NonNullable<ConversationResponderInput["episodicSummaries"]> {
  return memories.filter((memory) => isUsableEpisodicSummary(memory, message))
    .slice(0, 3)
    .map(({ id, value, createdAt }) => ({ id, summary: value, createdAt }));
}

function conversationResponsePreferenceInput(
  memories: readonly ConversationalMemory[]
): Pick<ConversationResponderInput, "responsePreference"> | Record<string, never> {
  const responsePreference = conversationResponsePreference(memories);
  return responsePreference ? { responsePreference } : {};
}

function isValidRestoredPlanningChoice(decision: AgentDecision): boolean {
  const choice = decision.planningChoice;
  if (!choice) return true;
  return Number.isSafeInteger(choice.monthlyAmountCents) && choice.monthlyAmountCents > 0 &&
    Number.isSafeInteger(choice.monthlyAmountCents * 12) &&
    Number.isSafeInteger(choice.annualProjectionCents) &&
    choice.annualProjectionCents === choice.monthlyAmountCents * 12 &&
    choice.monthlyAmountCents === decision.proposal?.suggestion.amountCents &&
    (choice.selectedHorizon === undefined || choice.selectedHorizon === "monthly" || choice.selectedHorizon === "annual");
}

function enforceMoneyMovementBoundary(message: string, classification: ClassifiedMessage): ClassifiedMessage {
  const coveredSpend = freedRecurringSpend(message);
  const explicitTransfer = isExplicitRealMoneyMovementRequest(message);
  const realMoneyIntent = isRealMoneyMovementRequest(message);
  if (coveredSpend && !explicitTransfer && (!realMoneyIntent || isBudgetingAdviceQuestion(message))) {
    return {
      type: "avoided_spend",
      confidence: Math.max(classification.confidence, 0.95),
      amountCents: coveredSpend.amountCents,
      summary: message,
      needsClarification: false
    };
  }
  if (!explicitTransfer && !realMoneyIntent) return classification;
  return {
    type: "real_money_movement_request",
    confidence: 1,
    summary: classification.summary || message,
    needsClarification: false
  };
}

function mapEpisodeSourceTurns(
  userMessages: readonly string[],
  sourceTurns: readonly { readonly turnId: string; readonly userMessage: string }[]
): readonly { readonly turnId: string }[] {
  const references: { turnId: string }[] = [];
  const turnIdsByMessage = new Map<string, string[]>();
  for (const sourceTurn of sourceTurns) {
    const ids = turnIdsByMessage.get(sourceTurn.userMessage) ?? [];
    ids.push(sourceTurn.turnId);
    turnIdsByMessage.set(sourceTurn.userMessage, ids);
  }
  for (const message of userMessages) {
    const turnId = turnIdsByMessage.get(message)?.shift();
    if (turnId?.trim()) references.push({ turnId });
  }
  return Object.freeze(references);
}

function withCurrentTurnEvidence(
  memory: Omit<ConversationalMemory, "id" | "createdAt">,
  request: AgentRequest
): Omit<ConversationalMemory, "id" | "createdAt"> {
  const current = request.sourceTurnReferences?.find((reference) => reference.userMessage === request.message);
  if (!current?.turnId.trim()) return memory;
  const existing = Array.isArray(memory.sourceMetadata?.sourceTurnReferences)
    ? memory.sourceMetadata.sourceTurnReferences.filter((item): item is { turnId: string } =>
      Boolean(item && typeof item === "object" && "turnId" in item && typeof item.turnId === "string"))
    : [];
  return {
    ...memory,
    sourceMetadata: {
      ...memory.sourceMetadata,
      sourceTurnReferences: [...new Map([...existing, { turnId: current.turnId }].map((item) => [item.turnId, item])).values()]
    }
  };
}
