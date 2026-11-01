import { createHash } from "node:crypto";
import type { LlmAdapter } from "./llm/types.js";
import type { MemoryProvider } from "./memory/types.js";
import { MemoryOrchestrator } from "./memory/memory-orchestrator.js";
import type { AgentTeamSpecialists } from "./team-prototype.js";
import { composeTeamDecisionMessage, type TeamAdvice } from "./response-composition.js";
import type { VoiceDraftIssue } from "./team-response-policy.js";
import { canCallTool, interpretApprovalResponse } from "./policy.js";
import {
  isAnswerToRecentVictoriaQuestion,
  isCoveredAllocationTargetChoice,
  resolveCoveredSpendPeriodAnswer
} from "./conversation-dialogue-policy.js";
import { transitionSavingsProposal } from "../domain/savings/proposal-lifecycle.js";
import type { VictoriaTools } from "./tools/contracts.js";
import { formatUsd } from "../domain/money.js";
import { parseExplicitDollarAmount } from "../domain/financial-events/parse-explicit-amount.js";
import { immutableSnapshot } from "../domain/immutable.js";
import type {
  PendingSavingsGoalAllocation,
  SavingsEntry,
  SavingsGoalAllocation,
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
import { ConversationTranscriptService } from "./conversation-transcript-service.js";
import { ConversationTurnCompletionService } from "./conversation-turn-completion-service.js";
import { buildTurnActionReceipt } from "./turn-action-receipt-builder.js";
import { extractMerchantSpendClaim } from "./memory/extract-preference.js";
import {
  buildAwaitingAmountConversationState,
  selectConversationWorkflowState
} from "./conversation-state-manager.js";
import { buildVictoriaConversationContext } from "./conversation-context-builder.js";
import type { VictoriaConversationContext } from "./conversation-context-builder.js";
import { isMemoryLearningEligibleTurn } from "./memory/memory-learning-policy.js";
import type { MemoryLearningEnqueuer, MemoryLearningOutcome } from "./memory/memory-learning-service.js";
import { MemoryLearningCoordinator } from "./memory/memory-learning-coordinator.js";
import { correctRememberedSpendFromConversation } from "./memory/memory-correction-service.js";
import { isSpendingQuestion, personalizeOrdinaryReply, selectPersonalizationMemories } from "./memory/personalized-ordinary-reply.js";
import { EpisodicMemoryService } from "./memory/episodic-memory-service.js";
import { MerchantSpendMemoryService } from "./memory/merchant-spend-memory-service.js";
import { CoveredExpenseAllocationMemoryService } from "./memory/covered-expense-allocation-memory-service.js";
import { FinancialTurnAssessmentService } from "./financial-turn-assessment-service.js";
import { FinancialClassificationDecisionService } from "./financial-classification-decision-service.js";
import { SavingsSuggestionService } from "./savings-suggestion-service.js";
import { ConversationMemoryCaptureService } from "./conversation-memory-capture-service.js";
import type { ContextReferenceResolver } from "./context-reference-resolver.js";
import { buildConversationContextSnapshot, type ConversationContextSnapshot, type ConversationReplyFallbackReason, type ConversationResponder, type ConversationResponderInput } from "./conversation-responder.js";
import { describeAnnualProjection, describeCombinedProjectionAndClarifyRecordTarget, getPriorCoveredSpendProjection, isCurrentMonthRecordRequest } from "./planning-response-policy.js";
import { ConversationReplyService } from "./conversation-reply-service.js";
import type { ConversationReplyTrace } from "./conversation-reply-service.js";
import { ConversationTurnReplyService, conversationResponderMemories, conversationResponsePreferenceInput, selectConversationEpisodeSummaries, withoutConversationEventHistory } from "./conversation-turn-reply-service.js";
import {
  buildConversationIntentPlan,
  shouldDispatchConversationIntent,
  shouldSkipFinancialAssessmentForAdvisoryTurn
} from "./conversation-intent-plan.js";
import { ConversationTurnUnderstandingService, type TurnUnderstandingComparison, type TurnUnderstandingProvider } from "./turn-understanding.js";
import {
  canSkipFinancialClassification,
  isOrdinaryQuestion,
  isReadOnlyEventHistoryQuestion
} from "./conversation-routing.js";
import { PendingWorkflowResponseService } from "./pending-workflow-response-service.js";
import { isUsableTransactionHistoryEstimate, type TransactionHistoryProvider } from "./transaction-history-provider.js";
import { buildSavingsSuggestionDecision } from "./savings-suggestion-decision-builder.js";
import type { ConversationalMemoryExtractor } from "./memory/conversational-memory-extractor.js";
import type { EpisodicMemorySummarizer } from "./memory/episodic-summary.js";
import { validatePersonalizedReply, type ConversationalReplyPersonalizer } from "./memory/personalized-reply.js";
import type { PendingAmountClarificationStore } from "./pending-amount-clarification-store.js";
import { PendingAmountClarificationService } from "./pending-amount-clarification-service.js";
import { PendingEntryCorrectionService } from "./pending-entry-correction-service.js";
import { PendingEntryCorrectionProposalService } from "./pending-entry-correction-proposal-service.js";
import { PendingGoalAllocationService } from "./pending-goal-allocation-service.js";
import { PendingGoalAllocationProposalService } from "./pending-goal-allocation-proposal-service.js";
import { PendingSavingsProposalService } from "./pending-savings-proposal-service.js";
import { PendingSavingsRevisionService } from "./pending-savings-revision-service.js";
import { PendingSavingsPlanningResponseService } from "./pending-savings-planning-response-service.js";
import { PendingWorkflowPersistenceService } from "./pending-workflow-persistence-service.js";
import type { PendingSavingsActionStore } from "./pending-savings-action-store.js";
import type { PendingGoalAllocationActionStore } from "./pending-goal-allocation-store.js";
import type { PendingEntryCorrectionStore } from "./pending-entry-correction-store.js";
import { InMemoryConversationSavingsEventStore } from "./savings-event-store.js";
import type { ConversationSavingsEventStore } from "./savings-event-store.js";
import { getRecentConversationSavingsEntry } from "./conversation-savings-history-service.js";
import { ConversationMemoryContextService } from "./conversation-memory-context-service.js";
import { FinancialFactService } from "./financial-fact-service.js";
import { PendingSavingsHistoryResponseService } from "./pending-savings-history-response-service.js";
import { PendingSavingsReadOnlyResponseService } from "./pending-savings-read-only-response-service.js";
import { PendingSavingsDeclineResponseService } from "./pending-savings-decline-response-service.js";
import { PendingSavingsConfirmationService } from "./pending-savings-confirmation-service.js";

export type { TurnUnderstandingComparison } from "./turn-understanding.js";

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
  /** Durable, identity-only learning queue. Extraction runs after the turn is complete. */
  memoryLearningEnqueuer?: MemoryLearningEnqueuer;
  onMemoryLearningQueueFailure?: (reason: "unavailable" | "turn_reference_missing") => void;
  /** Receives a provider failure name only; the current turn continues without provider-derived memories. */
  onConversationalMemoryExtractionFailure?: (errorName: string) => void;
  /** Content-free memory extraction timing and outcome; observer failures never affect the turn. */
  onConversationalMemoryLearningOutcome?: (outcome: MemoryLearningOutcome) => void;
  /** Receives an enumerated fallback reason only; no user message or draft content is included. */
  onConversationReplyFallback?: (reason: ConversationReplyFallbackReason) => void;
  /** Content-free per-response validator and recovery outcomes. */
  onConversationReplyTrace?: (trace: ConversationReplyTrace) => void;
  /** Reports only a categorical reason when contextual interpretation falls back to the typed deterministic plan. */
  onTurnUnderstandingFallback?: (reason: "unavailable" | "invalid_output") => void;
  /** Content-free shadow comparison; includes only intent/action categories, never user text or model rationale. */
  onTurnUnderstandingComparison?: (comparison: TurnUnderstandingComparison) => void;
  /** Receives only the failed provider stage; the turn continues with conservative deterministic interpretation. */
  onFinancialMomentFallback?: (source: "classifier" | "specialist") => void;
  /** Content-free countable route outcome for financial assessment and safe bypasses. */
  onFinancialAssessmentRoute?: (route: FinancialAssessmentRoute) => void;
  /** Safe runtime trace: excludes message text, memory values, and hidden reasoning. */
  onConversationTurnTrace?: (trace: ConversationTurnTrace) => void;
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

type ConversationSavingsHistoryTools = VictoriaAgentDependencies["tools"] & {
  listSavingsEntries?: (userId: string) => Promise<readonly SavingsEntry[]>;
};

export interface ConversationTurnTrace {
  readonly schemaVersion: 5;
  readonly durationMs: number;
  readonly classification: ClassifiedMessage["type"];
  readonly action: AgentDecision["action"];
  readonly ledgerWrite: boolean;
  readonly proposalTransitionCount: number;
  readonly sourceTurnReferenceCount: number;
  readonly recentMessageCount: number;
  readonly historyRepresentation: "typed" | "legacy";
  readonly assistantTranscriptPersisted: boolean;
  readonly savingsEventPersisted: boolean;
  readonly workflowStatePersisted: boolean;
  readonly requestReference?: string;
}

export type FinancialAssessmentRoute =
  | "assessed"
  | "skipped_plain_question"
  | "skipped_model_dialogue"
  | "resolved_pending_amount";

export class VictoriaAgent {
  private readonly dependencies: VictoriaAgentDependencies;
  private readonly savingsEvents: ConversationSavingsEventStore;
  private readonly conversationReplies: ConversationReplyService;
  private readonly conversationTurnReplies: ConversationTurnReplyService;
  private readonly turnUnderstanding: ConversationTurnUnderstandingService;
  private readonly episodicMemory: EpisodicMemoryService;
  private readonly merchantSpendMemory: MerchantSpendMemoryService;
  private readonly coveredExpenseAllocationMemory: CoveredExpenseAllocationMemoryService;
  private readonly financialTurnAssessment: FinancialTurnAssessmentService;
  private readonly financialClassificationDecisions: FinancialClassificationDecisionService;
  private readonly savingsSuggestions: SavingsSuggestionService;
  private readonly conversationMemoryCapture: ConversationMemoryCaptureService;
  private readonly memoryLearning: MemoryLearningCoordinator;
  private readonly pendingAmountClarificationService: PendingAmountClarificationService;
  private readonly pendingEntryCorrectionService = new PendingEntryCorrectionService();
  private readonly pendingEntryCorrectionProposals: PendingEntryCorrectionProposalService;
  private readonly pendingGoalAllocationService = new PendingGoalAllocationService();
  private readonly pendingGoalAllocationProposals: PendingGoalAllocationProposalService;
  private readonly pendingSavingsProposalService = new PendingSavingsProposalService();
  private readonly pendingSavingsPlanningResponses = new PendingSavingsPlanningResponseService(this.pendingSavingsProposalService);
  private readonly pendingSavingsRevisions: PendingSavingsRevisionService;
  private readonly pendingWorkflowResponses: PendingWorkflowResponseService;
  private readonly pendingWorkflowPersistence: PendingWorkflowPersistenceService;
  private readonly conversationTranscript: ConversationTranscriptService;
  private readonly conversationTurnCompletion: ConversationTurnCompletionService;
  private readonly conversationMemoryContext: ConversationMemoryContextService;
  private readonly financialFacts: FinancialFactService;
  private readonly pendingSavingsHistoryResponses: PendingSavingsHistoryResponseService;
  private readonly pendingSavingsReadOnlyResponses: PendingSavingsReadOnlyResponseService;
  private readonly pendingSavingsDeclineResponses: PendingSavingsDeclineResponseService;
  private readonly pendingSavingsConfirmations: PendingSavingsConfirmationService;
  private readonly recentSavingsEntriesByConversation = new Map<string, SavingsEntry>();
  private nextActionNumber = 1;
  private nextEventNumber = 1;
  private nextProposalNumber = 1;
  private nextApprovalNumber = 1;
  private nextGoalAllocationNumber = 1;
  private nextGoalApprovalNumber = 1;
  private nextProposalTransitionNumber = 1;

  constructor(dependencies: VictoriaAgentDependencies) {
    this.dependencies = {
      ...dependencies,
      memory: dependencies.memory instanceof MemoryOrchestrator
        ? dependencies.memory
        : new MemoryOrchestrator(dependencies.memory)
    };
    this.conversationMemoryCapture = new ConversationMemoryCaptureService({
      memory: this.dependencies.memory,
      ...(dependencies.transactionHistory ? { transactionHistory: dependencies.transactionHistory } : {})
    });
    this.financialClassificationDecisions = new FinancialClassificationDecisionService({
      getWeeklySavingsTotal: userId => this.dependencies.tools.getWeeklySavingsTotal(userId),
      suggestSavings: (request, classification, savingsEvent, teamAdvice) =>
        this.savingsSuggestions.suggest({ request, classification,
          ...(savingsEvent ? { existingSavingsEvent: savingsEvent } : {}),
          ...(teamAdvice ? { teamAdvice } : {}) })
    });
    this.savingsEvents = dependencies.savingsEvents ?? new InMemoryConversationSavingsEventStore();
    this.conversationReplies = new ConversationReplyService(
      dependencies.conversationResponder,
      dependencies.onConversationReplyFallback,
      dependencies.onConversationReplyTrace
    );
    this.memoryLearning = new MemoryLearningCoordinator({
      memory: this.dependencies.memory,
      ...(dependencies.conversationalMemoryExtractor ? { extractor: dependencies.conversationalMemoryExtractor } : {}),
      ...(dependencies.memoryLearningEnqueuer ? { enqueuer: dependencies.memoryLearningEnqueuer } : {}),
      ...(dependencies.onMemoryLearningQueueFailure ? { onQueueFailure: dependencies.onMemoryLearningQueueFailure } : {}),
      ...(dependencies.onConversationalMemoryExtractionFailure ? { onExtractionFailure: dependencies.onConversationalMemoryExtractionFailure } : {}),
      ...(dependencies.onConversationalMemoryLearningOutcome ? { onOutcome: dependencies.onConversationalMemoryLearningOutcome } : {})
    });
    this.turnUnderstanding = new ConversationTurnUnderstandingService({
      ...(dependencies.llm.understandTurn ? { provider: dependencies.llm as TurnUnderstandingProvider } : {}),
      ...(dependencies.onTurnUnderstandingFallback ? { onFallback: dependencies.onTurnUnderstandingFallback } : {}),
      ...(dependencies.onTurnUnderstandingComparison ? { onComparison: dependencies.onTurnUnderstandingComparison } : {})
    });
    this.conversationTurnReplies = new ConversationTurnReplyService(
      this.dependencies.memory, this.conversationReplies, this.turnUnderstanding
    );
    this.episodicMemory = new EpisodicMemoryService(this.dependencies.memory, dependencies.episodicMemorySummarizer);
    this.merchantSpendMemory = new MerchantSpendMemoryService(this.dependencies.memory);
    this.coveredExpenseAllocationMemory = new CoveredExpenseAllocationMemoryService(this.dependencies.memory);
    this.financialTurnAssessment = new FinancialTurnAssessmentService({
      llm: dependencies.llm,
      ...(dependencies.specialists ? { specialists: dependencies.specialists } : {}),
      ...(dependencies.onFinancialMomentFallback ? { onFinancialMomentFallback: dependencies.onFinancialMomentFallback } : {}),
      ...(dependencies.onCompanionVoiceValidationFailure
        ? { onCompanionVoiceValidationFailure: dependencies.onCompanionVoiceValidationFailure } : {})
    });
    this.pendingAmountClarificationService = new PendingAmountClarificationService(dependencies.pendingAmountClarifications);
    this.pendingEntryCorrectionProposals = new PendingEntryCorrectionProposalService({
      pendingCorrections: this.pendingEntryCorrectionService,
      resolveRecentEntry: (request, conversationKey) => getRecentConversationSavingsEntry({
        userId: request.userId,
        conversationId: request.conversationId ?? "",
        conversationKey,
        cache: this.recentSavingsEntriesByConversation,
        ...(dependencies.savingsEvents ? { eventStore: dependencies.savingsEvents } : {}),
        tools: this.dependencies.tools as ConversationSavingsHistoryTools
      }),
      getEffectiveAmount: (userId, entryId) => this.dependencies.tools.getEffectiveSavingsEntryAmount(userId, entryId)
    });
    this.pendingGoalAllocationProposals = new PendingGoalAllocationProposalService({
      pendingAllocations: this.pendingGoalAllocationService,
      resolveRecentEntry: (request, conversationKey) => getRecentConversationSavingsEntry({
        userId: request.userId,
        conversationId: request.conversationId ?? "",
        conversationKey,
        cache: this.recentSavingsEntriesByConversation,
        ...(dependencies.savingsEvents ? { eventStore: dependencies.savingsEvents } : {}),
        tools: this.dependencies.tools as ConversationSavingsHistoryTools
      }),
      getEffectiveAmount: (userId, entryId) => this.dependencies.tools.getEffectiveSavingsEntryAmount(userId, entryId)
    });
    this.conversationTranscript = new ConversationTranscriptService(this.dependencies.memory);
    this.conversationTurnCompletion = new ConversationTurnCompletionService(this.conversationTranscript, this.savingsEvents);
    this.conversationMemoryContext = new ConversationMemoryContextService(this.dependencies.memory);
    this.financialFacts = new FinancialFactService(dependencies.contextReferenceResolver);
    this.pendingSavingsHistoryResponses = new PendingSavingsHistoryResponseService({
      savingsEvents: this.savingsEvents,
      memoryContext: this.conversationMemoryContext,
      turnUnderstanding: this.turnUnderstanding,
      respondConversationalTurn: input => this.respondConversationalTurn(
        input.request,
        input.recentTurns,
        input.baselineReply,
        "savings_entry",
        input.events,
        input.financialContext,
        input.contextSnapshot
      )
    });
    this.pendingSavingsReadOnlyResponses = new PendingSavingsReadOnlyResponseService({
      responderEnabled: Boolean(dependencies.conversationResponder),
      learnFromReadOnlyTopicTurn: request => this.learnFromReadOnlyTopicTurn(request),
      respond: (request, recentTurns, readOnlyTurnContext, workflowState, baselineReply) => {
        const readOnlyContext = buildVictoriaConversationContext({
          priorTurns: recentTurns,
          turnContext: readOnlyTurnContext,
          message: request.message,
          savingsEvents: [],
          ...(workflowState ? { workflowState } : {})
        });
        return this.respondConversationalTurn(
          request,
          recentTurns,
          baselineReply,
          "savings_entry",
          readOnlyContext.conversationSavingsEvents,
          readOnlyContext
        );
      }
    });
    this.pendingSavingsDeclineResponses = new PendingSavingsDeclineResponseService({
      memoryContext: this.conversationMemoryContext,
      ...(dependencies.personalizedReplyPersonalizer ? { personalizer: dependencies.personalizedReplyPersonalizer } : {}),
      respondToFollowUp: (request, question, recentTurns) => this.respondTurn(
        { ...request, message: question }, recentTurns
      )
    });
    this.pendingSavingsRevisions = new PendingSavingsRevisionService({
      proposals: this.pendingSavingsProposalService,
      replacePendingProposal: (request, decision, classification) =>
        this.replacePendingSavingsProposal(request, decision, classification)
    });
    this.pendingWorkflowPersistence = new PendingWorkflowPersistenceService({
      ...(dependencies.pendingSavingsActions ? { savingsStore: dependencies.pendingSavingsActions } : {}),
      ...(dependencies.pendingGoalAllocationActions ? { goalAllocationStore: dependencies.pendingGoalAllocationActions } : {}),
      ...(dependencies.pendingEntryCorrections ? { entryCorrectionStore: dependencies.pendingEntryCorrections } : {}),
      savings: this.pendingSavingsProposalService,
      goalAllocations: this.pendingGoalAllocationService,
      corrections: this.pendingEntryCorrectionService
    });
    this.pendingWorkflowResponses = new PendingWorkflowResponseService({
      corrections: this.pendingEntryCorrectionService,
      goalAllocations: this.pendingGoalAllocationService,
      conversationResponderEnabled: Boolean(dependencies.conversationResponder),
      callbacks: {
        approveEntryCorrection: (request, decision) => this.approveEntryCorrection(request, decision),
        approveGoalAllocation: (request, decision) => this.approveGoalAllocation(request, decision),
        learnFromReadOnlyTopicTurn: request => this.learnFromReadOnlyTopicTurn(request),
        respondConversationalTurn: (request, recentTurns, baselineReply, pendingAction) =>
          this.respondConversationalTurn(request, recentTurns, baselineReply, pendingAction)
      }
    });
    this.pendingSavingsConfirmations = new PendingSavingsConfirmationService({
      proposals: this.pendingSavingsProposalService,
      declineResponses: this.pendingSavingsDeclineResponses,
      historyResponses: this.pendingSavingsHistoryResponses,
      planningResponses: this.pendingSavingsPlanningResponses,
      readOnlyResponses: this.pendingSavingsReadOnlyResponses,
      approve: (request, decision) => this.approveToolCall(request, decision),
      createTransitionId: () => this.nextId("proposal_transition", this.nextProposalTransitionNumber++),
      responderEnabled: Boolean(dependencies.conversationResponder)
    });
    this.savingsSuggestions = new SavingsSuggestionService({
      tools: this.dependencies.tools,
      merchantSpendMemory: this.merchantSpendMemory,
      ...(dependencies.transactionHistory ? { transactionHistory: dependencies.transactionHistory } : {}),
      pendingAmountClarifications: this.pendingAmountClarificationService,
      pendingSavingsProposals: this.pendingSavingsProposalService,
      buildSavingsEvent: (request, classification) => this.buildSavingsEvent(request, classification),
      clearRecentSavingsEntry: request => { this.recentSavingsEntriesByConversation.delete(this.conversationKey(request)); },
      conversationKey: request => this.conversationKey(request),
      createId: namespace => namespace === "savings_action"
        ? this.nextId(namespace, this.nextActionNumber++)
        : this.nextId(namespace, this.nextProposalNumber++)
    });
  }

  async respond(request: AgentRequest): Promise<AgentResponse> {
    const startedAt = Date.now();
    const conversationId = request.conversationId ?? "default";
    this.pendingWorkflowPersistence.expireForRequest(request);
    await this.pendingWorkflowPersistence.restoreSavings(request);
    await this.pendingWorkflowPersistence.restoreGoalAllocation(request);
    await this.pendingWorkflowPersistence.restoreEntryCorrection(request);
    const conversationKey = this.conversationKey(request);
    const priorPendingGoal = this.pendingGoalAllocationService.getForConversation(request.userId, conversationKey);
    const priorPendingGoalActionId = priorPendingGoal?.actionId;
    const priorPendingGoalDecision = priorPendingGoal?.state.decision;
    const priorCorrection = this.pendingEntryCorrectionService.getForConversation(request.userId, conversationKey);
    const priorCorrectionId = priorCorrection?.actionId;
    const loadedTranscript = await this.conversationTranscript.load(request.userId, conversationId);
    const priorContext = loadedTranscript.context;
    await this.summarizeOverflowingConversation(request.userId, conversationId, priorContext, request.sourceTurnReferences ?? []);
    const withUserMessages = this.conversationTranscript.appendUserTurn({
      conversationId,
      message: request.message,
      ...(request.sourceTurnReferences ? { sourceTurnReferences: request.sourceTurnReferences } : {}),
      loaded: loadedTranscript
    });
    await this.conversationTranscript.persist(request.userId, conversationId, withUserMessages);
    const response = immutableSnapshot(await this.respondTurn(request, priorContext));
    const savingsEventPersisted = await this.conversationTurnCompletion.recordSavingsEvent(response, conversationId);
    const workflowStatePersisted = await this.conversationTurnCompletion.persistWorkflowState({
      persistence: this.pendingWorkflowPersistence,
      request,
      response,
      ...(priorPendingGoalActionId ? { priorGoalActionId: priorPendingGoalActionId } : {}),
      ...(priorPendingGoalDecision ? { priorGoalDecision: priorPendingGoalDecision } : {}),
      ...(priorCorrectionId ? { priorCorrectionActionId: priorCorrectionId } : {}),
      ...(priorCorrection?.state.decision ? { priorCorrectionDecision: priorCorrection.state.decision } : {})
    });
    const assistantTranscriptPersisted = await this.conversationTurnCompletion.persistAssistantTranscript({
      userId: request.userId, conversationId, messages: withUserMessages, response
    });
    const trace: ConversationTurnTrace = Object.freeze({
      schemaVersion: 5,
      durationMs: Math.max(0, Date.now() - startedAt),
      classification: response.decision.classification.type,
      action: response.decision.action,
      ledgerWrite: response.decision.action === "create_ledger_entry",
      proposalTransitionCount: response.decision.proposalTransitions?.length ?? 0,
      sourceTurnReferenceCount: request.sourceTurnReferences?.length ?? 0,
      recentMessageCount: priorContext.length,
      historyRepresentation: loadedTranscript.typedMessages ? "typed" : "legacy",
      assistantTranscriptPersisted,
      savingsEventPersisted,
      workflowStatePersisted,
      ...(request.sourceTurnReferences?.at(-1)?.turnId ? {
        requestReference: createHash("sha256").update(request.sourceTurnReferences.at(-1)!.turnId).digest("hex").slice(0, 12)
      } : {})
    });
    try { this.dependencies.onConversationTurnTrace?.(trace); }
    catch { /* Observability cannot block a completed turn. */ }
    return response;
  }

  /** Called only by the trusted durable memory-learning worker for a completed turn. */
  async learnFromQueuedTurn(request: AgentRequest): Promise<void> {
    await this.memoryLearning.learnQueuedTurn(request);
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
    return this.episodicMemory.summarize({ userId, context, finishing, entries, sourceTurnReferences });
  }

  private async respondTurn(request: AgentRequest, conversationContext: readonly string[]): Promise<AgentResponse> {
    const conversationKey = this.conversationKey(request);
    const { turnContext, annualProjection } = await this.financialFacts.build(request.message, conversationContext);
    const answerToRecentQuestion = isAnswerToRecentVictoriaQuestion(conversationContext);
    const scopedAllocationTargetChoice = isCoveredAllocationTargetChoice(request.message, conversationContext);
    let interestSavedThisTurn = false;
    const pendingCorrection = this.pendingEntryCorrectionService.getForConversation(request.userId, conversationKey);
    const correctionResponse = await this.pendingWorkflowResponses.resolveEntryCorrection(request, conversationContext);
    if (correctionResponse) return correctionResponse;
    const pendingGoal = this.pendingGoalAllocationService.getForConversation(request.userId, conversationKey);
    const pendingGoalAction = pendingGoal?.state;
    const goalAllocationResponse = await this.pendingWorkflowResponses.resolveGoalAllocation(request, conversationContext);
    if (goalAllocationResponse) return goalAllocationResponse;

    const pendingSavingsContext = this.pendingSavingsProposalService.getContextForConversation(
      request.userId, conversationKey, conversationContext
    );
    const pendingActionId = pendingSavingsContext?.actionId;
    const pendingAction = pendingSavingsContext?.state;
    const pendingSavingsConversationState = pendingSavingsContext?.workflowState;

    if (pendingAction && pendingActionId) {
      const pendingResponse = await this.pendingSavingsConfirmations.resolve({
        request,
        recentTurns: conversationContext,
        turnContext,
        pending: { actionId: pendingActionId, state: pendingAction },
        ...(pendingSavingsConversationState ? { workflowState: pendingSavingsConversationState } : {}),
        ...(annualProjection ? { annualProjection } : {}),
        ...(turnContext.annualProjection?.eventCount === 2 ? { recurringCosts: turnContext.recurringCosts } : {})
      });
      if (pendingResponse) return pendingResponse;
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

    if (turnContext.possibleRecordedRepeatAmountCents !== undefined) {
      const message = `This sounds like the ${formatUsd(turnContext.possibleRecordedRepeatAmountCents)} savings moment we just discussed. Is it a separate new occurrence? I won't add another entry until that's clear.`;
      return { message, decision: {
        action: "ask_follow_up",
        classification: { type: "unclear", confidence: 1, summary: request.message, needsClarification: true },
        userFacingMessage: message
      } };
    }

    const memoryCapture = await this.conversationMemoryCapture.capture({
      request,
      skipDirectCapture: scopedAllocationTargetChoice,
      deferMixedFactToProvider: Boolean(this.dependencies.conversationalMemoryExtractor)
    });
    const spendCorrection = memoryCapture.spendCorrection;
    interestSavedThisTurn = memoryCapture.interestSavedThisTurn;
    if (memoryCapture.acknowledgement) {
      let message = memoryCapture.acknowledgement;
      const classification: ClassifiedMessage = {
        type: "general_finance", confidence: 1, summary: request.message, needsClarification: false
      };
      if ((pendingCorrection || pendingGoalAction || pendingAction) && !isOrdinaryQuestion(request.message)) {
        const pendingPrompt = pendingCorrection
          ? "Please also give me a clear yes or no about the pending correction."
          : pendingGoalAction
            ? "Please also give me a clear yes or no about the pending goal allocation."
            : "Please also give me a clear yes or no about the pending savings entry.";
        message = `${message} ${pendingPrompt}`;
        return { message, decision: { action: "ask_follow_up", classification, userFacingMessage: message } };
      }
      if (!memoryCapture.isMixedFinancialTurn && !isOrdinaryQuestion(request.message) &&
          !this.dependencies.conversationResponder) {
        return { message, decision: { action: "reflect", classification, userFacingMessage: message } };
      }
    }

    const memory = await this.conversationMemoryContext.retrieve(request.userId, request.message);
    const pendingClarification = await this.pendingAmountClarificationService.get(request);
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
    const intentPlan = buildConversationIntentPlan({
      message: request.message,
      recentTurns: conversationContext,
      hasPendingWorkflow: Boolean(pendingAction || pendingGoalAction || pendingCorrection || pendingClarification)
    });
    const independentQuestion = intentPlan.readOnlyQuestions.length > 0 &&
      intentPlan.readOnlyQuestions[0] !== request.message.trim()
      ? intentPlan.readOnlyQuestions[0]
      : undefined;
    const canUseEventHistory = !independentQuestion && isReadOnlyEventHistoryQuestion(request.message);
    const responderFinancialContext = canUseEventHistory
      ? financialContext
      : withoutConversationEventHistory(financialContext);
    const responsePreferenceInput = conversationResponsePreferenceInput(memory.conversationalMemories ?? []);
    const episodicSummaries = selectConversationEpisodeSummaries(memory.conversationalMemories ?? [], request.message);
    const baseContextSnapshot = buildConversationContextSnapshot({
      message: request.message,
      recentTurns: conversationContext,
      memories: conversationResponderMemories(memory.conversationalMemories ?? [], responderFinancialContext, request.message),
      episodicSummaries,
      ...responsePreferenceInput,
      ...(pendingAction ? { pendingAction: "savings_entry" as const } : {}),
      ...(canUseEventHistory ? { conversationSavingsEvents: responderFinancialContext.conversationSavingsEvents } : {}),
      financialContext: responderFinancialContext
    });
    const canSkipFinancialMoment = Boolean(this.dependencies.conversationResponder) &&
      canSkipFinancialClassification(request.message) && !pendingAction && !pendingGoalAction &&
      !pendingCorrection && !pendingClarification;
    const interpretation = await this.turnUnderstanding.understand({
      contextSnapshot: baseContextSnapshot,
      fallback: intentPlan
    });
    const skipByModelDialogue = !pendingAction && !pendingGoalAction && !pendingCorrection && !pendingClarification &&
      interpretation.source === "model" && shouldSkipFinancialAssessmentForAdvisoryTurn({
        message: request.message,
        deterministicPlan: intentPlan,
        advisoryPlan: interpretation.plan
      });
    const skipFinancialAssessment = canSkipFinancialMoment || skipByModelDialogue;
    const contextSnapshot: ConversationContextSnapshot = Object.freeze({
      ...baseContextSnapshot,
      turnUnderstanding: interpretation.plan,
      turnUnderstandingSource: interpretation.source
    });
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
      if (interpretation.plan.dialogueActs.includes("question") && this.dependencies.conversationResponder) {
        return this.respondConversationalTurn(
          request, conversationContext, message, undefined, undefined, undefined, contextSnapshot
        );
      }
      return {
        message,
        decision: {
          action: "reflect",
          classification: { type: "general_finance", confidence: 1, summary: request.message, needsClarification: false },
          userFacingMessage: message
        }
      };
    }
    if (spendCorrection && !pendingCorrection && !pendingGoalAction && !pendingAction) {
      const correction = await correctRememberedSpendFromConversation({
        request, conversationContext, correction: spendCorrection, memory: this.dependencies.memory
      });
      if (interpretation.plan.dialogueActs.includes("question") && this.dependencies.conversationResponder) {
        return this.respondConversationalTurn(
          request,
          conversationContext,
          correction.message,
          undefined,
          undefined,
          undefined,
          contextSnapshot
        );
      }
      return correction;
    }
    const activeProposalReference = financialContext.workflowState?.status === "awaiting_confirmation"
      ? financialContext.workflowState.currentMessageProposalReference
      : undefined;
    const amountRevisionIssue = parsedReplyAmount.status === "multiple_amounts" ? "multiple_amounts"
      : parsedReplyAmount.status === "invalid_precision" ? "invalid_precision"
      : parsedReplyAmount.status === "unsupported_currency" ? "unsupported_currency"
      : parsedReplyAmount.status === "invalid_value" ? "invalid_value"
      : undefined;
    if (pendingAction && pendingActionId && amountRevisionIssue) {
      const invalidAmountResponse = this.pendingSavingsRevisions.resolveInvalidAmountAttempt({
        request,
        actionId: pendingActionId,
        pending: pendingAction,
        ...(pendingSavingsConversationState ? { workflowState: pendingSavingsConversationState } : {}),
        ...(activeProposalReference ? { proposalReference: activeProposalReference } : {}),
        amountIssue: amountRevisionIssue
      });
      if (invalidAmountResponse) return invalidAmountResponse;
    }
    const { classification: classifiedMessage, teamAdvice, resolvedReference } = skipFinancialAssessment
      ? {
          classification: {
            type: "general_finance" as const, confidence: 1, summary: request.message, needsClarification: false
          },
          teamAdvice: undefined,
          resolvedReference: undefined
        }
      : isPendingRevisionAmountAnswer
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
      : await this.financialTurnAssessment.assess({
          message: request.message,
          memory,
          conversationContext,
          financialContext,
          contextSnapshot
        });
    const assessmentRoute: FinancialAssessmentRoute = canSkipFinancialMoment
      ? "skipped_plain_question"
      : skipByModelDialogue
        ? "skipped_model_dialogue"
        : isPendingRevisionAmountAnswer || isPendingAmountAnswer
          ? "resolved_pending_amount"
          : "assessed";
    try { this.dependencies.onFinancialAssessmentRoute?.(assessmentRoute); }
    catch { /* Content-free routing metrics cannot interrupt a user turn. */ }
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
      const learnedCount = await this.memoryLearning.learnEligibleTurn(request);
      if (learnedCount > 0) memoryAcknowledgement = "I'll keep that in mind for future conversations.";
    }
    if (this.dependencies.conversationResponder &&
        shouldDispatchConversationIntent({
          message: request.message,
          deterministicPlan: intentPlan,
          advisoryPlan: interpretation.plan,
          financialClassificationType: classification.type
        })) {
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
      return this.pendingSavingsRevisions.resolve({
        request,
        actionId: pendingActionId,
        pending: pendingAction,
        ...(pendingSavingsConversationState ? { workflowState: pendingSavingsConversationState } : {}),
        ...(proposalReference ? { proposalReference } : {}),
        classification
      });
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

    if (pendingActionId && pendingAction) {
      const revisionAmountResponse = this.pendingSavingsRevisions.resolveAwaitingAmount({
        request,
        actionId: pendingActionId,
        pending: pendingAction,
        ...(pendingSavingsConversationState ? { workflowState: pendingSavingsConversationState } : {}),
        ...(activeProposalReference ? { proposalReference: activeProposalReference } : {}),
        classification
      });
      if (revisionAmountResponse) return revisionAmountResponse;
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
      const correctionProposal = await this.pendingEntryCorrectionProposals.propose({
        request,
        conversationKey,
        classification,
        createIds: () => {
          const sequence = this.nextActionNumber++;
          return {
            actionId: `entry_correction_action_${sequence}`,
            correctionId: `entry_correction_proposal_${sequence}`
          };
        }
      });
      if (correctionProposal) return correctionProposal;
    }

    if (classification.type === "goal_allocation" && classification.goalName) {
      const allocationProposal = await this.pendingGoalAllocationProposals.propose({
        request,
        conversationKey,
        classification,
        createIds: () => {
          const actionSequence = this.nextGoalAllocationNumber++;
          return {
            actionId: this.nextId("goal_allocation_action", actionSequence),
            allocationId: this.nextId("goal_allocation_proposal", actionSequence)
          };
        }
      });
      if (allocationProposal) return allocationProposal;
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
      await this.pendingAmountClarificationService.clear(request);
      const merchantName = pendingClarification?.classification.merchantName;
      if (merchantName && classification.amountCents !== undefined) {
        await this.merchantSpendMemory.rememberTypicalSpend(request, merchantName, classification.amountCents, request.message);
      }
    } else if (pendingClarification && classification.type !== "unclear") {
      await this.pendingAmountClarificationService.clear(request);
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
    const pendingWorkflowReference = pendingAction === "entry_correction" || pendingAction === "goal_allocation"
      ? this.pendingWorkflowReference(request, pendingAction)
      : undefined;
    return this.conversationTurnReplies.respond({
      request,
      recentTurns,
      baselineReply,
      ...(pendingAction ? { pendingAction } : {}),
      ...(pendingWorkflowReference ? { pendingWorkflowReference } : {}),
      ...(conversationSavingsEvents ? { conversationSavingsEvents } : {}),
      ...(financialContext ? { financialContext } : {}),
      ...(contextSnapshot ? { contextSnapshot } : {})
    });
  }

  private pendingWorkflowReference(
    request: AgentRequest,
    kind: "entry_correction" | "goal_allocation"
  ): ConversationResponderInput["pendingWorkflowReference"] {
    const conversationKey = this.conversationKey(request);
    const actionId = kind === "entry_correction"
      ? this.pendingEntryCorrectionService.getForConversation(request.userId, conversationKey)?.actionId
      : this.pendingGoalAllocationService.getForConversation(request.userId, conversationKey)?.actionId;
    if (!actionId) return undefined;
    const pending = kind === "entry_correction"
      ? this.pendingEntryCorrectionService.getByAction(request.userId, actionId)
      : this.pendingGoalAllocationService.getByAction(request.userId, actionId);
    if (pending?.userId !== request.userId || pending.conversationKey !== conversationKey) return undefined;
    return { kind, actionId };
  }

  private async generateConversationReply(input: ConversationResponderInput): Promise<string> {
    return this.conversationReplies.respond(input);
  }

  private async learnFromReadOnlyTopicTurn(request: AgentRequest): Promise<void> {
    await this.memoryLearning.learnReadOnlyTopicTurn(request);
  }

  private async decide(
    request: AgentRequest,
    classification: ClassifiedMessage,
    savingsEvent?: SavingsEvent,
    teamAdvice?: TeamAdvice
  ): Promise<AgentDecision> {
    return this.financialClassificationDecisions.decide({
      request,
      classification,
      ...(savingsEvent ? { savingsEvent } : {}),
      ...(teamAdvice ? { teamAdvice } : {})
    });
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
    const message = `I can record ${formatUsd(amountCents)} in your mocked Victoria savings ledger toward ${goalName}. Please confirm: should I record it? No real money has moved yet. This is only a mocked ledger record.`;
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
    this.pendingSavingsProposalService.deleteByAction(previousActionId);
    this.pendingSavingsProposalService.set(nextActionId, {
      userId: request.userId,
      conversationKey,
      decision: updatedDecision
    });

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
    const nextDecision = buildSavingsSuggestionDecision({
      classification,
      savingsEvent,
      suggestion,
      actionId: this.nextId("savings_action", this.nextActionNumber++),
      proposalId: this.nextId("proposal", this.nextProposalNumber++),
      createdAt: new Date().toISOString()
    });
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
    this.pendingSavingsProposalService.deleteByAction(previousActionId);
    this.pendingSavingsProposalService.set(nextActionId, {
      userId: request.userId,
      conversationKey,
      decision: revisedDecision
    });
    return { message: revisedDecision.userFacingMessage, decision: revisedDecision };
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
      ? this.pendingSavingsProposalService.getByAction(request.userId, approvedActionId)
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
      this.pendingSavingsProposalService.setApproval(request.userId, approvedActionIdForEntry, approval);
    }
    const savingsEntryReceipt = buildTurnActionReceipt(
      request,
      trustedDecision,
      "create_ledger_entry",
      `Done. I recorded ${formatUsd(trustedSuggestion.amountCents)}${trustedProposal.goalName ? ` toward ${trustedProposal.goalName}` : ""} in your Victoria savings ledger. No real money has moved yet. This is only a mocked ledger record.`
    );
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
      approvedActionId: approvedActionIdForEntry,
      ...(savingsEntryReceipt ? { turnActionReceipt: savingsEntryReceipt } : {})
    };

    let entry: SavingsEntry;
    try {
      entry = await this.dependencies.tools.createSavingsEntry(createSavingsEntryInput);
    } catch {
      const message = "I couldn't confirm whether the entry was recorded, so I haven't marked this action complete. You can say yes to safely retry the same entry. No real money has moved yet. This is only a mocked ledger record.";
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
    this.pendingSavingsProposalService.deleteByAction(completedActionId);

    const goalText = entry.goalName ? ` toward ${entry.goalName}` : "";
    let weeklyProgress: string;
    try {
      const weeklyTotalCents = await this.dependencies.tools.getWeeklySavingsTotal(request.userId);
      weeklyProgress = ` Your total in the mocked Victoria savings ledger this week is ${formatUsd(weeklyTotalCents)}.`;
    } catch {
      weeklyProgress = " I couldn't load your weekly total just now.";
    }
    const message = `Done. I recorded ${formatUsd(entry.amountCents)}${goalText} in your Victoria savings ledger.${weeklyProgress} No real money has moved yet. This is only a mocked ledger record.`;
    await this.coveredExpenseAllocationMemory.rememberChoice(request, trustedEvent);
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
    const pending = actionId ? this.pendingEntryCorrectionService.getByAction(request.userId, actionId) : undefined;
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
      this.pendingEntryCorrectionService.setApprovalId(request.userId, actionId, approvalId);
    }
    const correctionReceipt = buildTurnActionReceipt(
      request,
      trusted,
      "correct_ledger_entry",
      `Done. I corrected the recorded amount to ${formatUsd(correction.correctedAmountCents)}. The original entry remains in the history with this linked adjustment. No real money has moved.`
    );
    try {
      const recorded = await this.dependencies.tools.createSavingsEntryCorrection({
        userId: request.userId,
        savingsEntryId: correction.savingsEntryId,
        correctedAmountCents: correction.correctedAmountCents,
        reason: correction.reason,
        approvalId,
        approvedActionId: actionId,
        ...(correctionReceipt ? { turnActionReceipt: correctionReceipt } : {})
      });
      this.pendingEntryCorrectionService.deleteByAction(actionId);
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
      ? this.pendingGoalAllocationService.getByAction(request.userId, actionId)
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
      this.pendingGoalAllocationService.deleteByAction(actionId);
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
      this.pendingGoalAllocationService.deleteByAction(actionId);
      this.pendingGoalAllocationService.set(replacementActionId, {
        userId: request.userId,
        conversationKey: pendingAction.conversationKey,
        decision: replacementDecision
      });
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
      this.pendingGoalAllocationService.setApproval(request.userId, actionId, approval);
    }
    const allocationReceipt = buildTurnActionReceipt(
      request,
      trustedDecision,
      "record_goal_allocation",
      `Done. I linked the recorded ${formatUsd(allocation.amountCents)} entry to ${allocation.goalName} in your mocked Victoria savings ledger. No real money has moved yet. This is only a mocked ledger record.`
    );
    let recordedAllocation: SavingsGoalAllocation;
    try {
      recordedAllocation = await this.dependencies.tools.createSavingsGoalAllocation({
        userId: request.userId,
        savingsEntryId: allocation.savingsEntryId,
        amountCents: allocation.amountCents,
        goalName: allocation.goalName,
        approval,
        approvedActionId: actionId,
        ...(allocationReceipt ? { turnActionReceipt: allocationReceipt } : {})
      });
    } catch {
      const message = "I couldn't confirm whether the goal allocation was recorded. You can say yes to safely retry the same approved allocation. No real money has moved yet. This is only a mocked ledger record.";
      return {
        message,
        decision: {
          ...trustedDecision,
          action: "ask_follow_up",
          userFacingMessage: message
        }
      };
    }

    this.pendingGoalAllocationService.deleteByAction(actionId);
    const recentEntry = this.recentSavingsEntriesByConversation.get(pendingAction.conversationKey);
    if (recentEntry?.id === allocation.savingsEntryId) {
      this.recentSavingsEntriesByConversation.delete(pendingAction.conversationKey);
    }

    const message = `Done. I linked the recorded ${formatUsd(recordedAllocation.amountCents)} entry to ${recordedAllocation.goalName} in your mocked Victoria savings ledger. No real money has moved yet. This is only a mocked ledger record.`;
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
    return JSON.stringify([request.userId, request.conversationId ?? "default"]);
  }

  private nextId(namespace: string, sequence: number): string {
    return this.dependencies.idFactory
      ? `${namespace}_${this.dependencies.idFactory()}_${sequence}`
      : `${namespace}_${sequence}`;
  }
}

function isSimpleAmountReply(message: string): boolean {
  return /^\s*(?:(?:it's|its|about|around|the amount is|that is|use|make it|set it to)\s*)?\$\s*\d[\d,]*(?:\.\d{1,2})?\s*[.!?]*\s*$/i.test(message);
}
