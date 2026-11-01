import type { AgentRequest, AgentResponse } from "./types.js";
import type { MemoryProvider, ConversationalMemory } from "./memory/types.js";
import { buildTurnContext } from "./turn-context.js";
import { buildVictoriaConversationContext } from "./conversation-context-builder.js";
import type { VictoriaConversationContext } from "./conversation-context-builder.js";
import {
  buildConversationContextSnapshot,
  type ConversationContextSnapshot,
  type ConversationResponderInput,
  type ConversationResponderMemory
} from "./conversation-responder.js";
import type { ConversationReplyService } from "./conversation-reply-service.js";
import { calculateReadOnlySavingsQuestion } from "./read-only-calculator.js";
import { isRetrievableMemory, planMemoryRetrieval } from "./memory/retrieval-planner.js";
import { isUsableEpisodicSummary, suppressLifecycleConflictingEpisodes } from "./memory/episodic-summary.js";
import { buildConversationIntentPlan } from "./conversation-intent-plan.js";
import type { ConversationTurnUnderstandingService } from "./turn-understanding.js";

/** Owns memory/context assembly for read-only conversational replies. */
export class ConversationTurnReplyService {
  constructor(
    private readonly memory: MemoryProvider,
    private readonly replies: Pick<ConversationReplyService, "respond">,
    private readonly turnUnderstanding: Pick<ConversationTurnUnderstandingService, "understand">
  ) {}

  async respond(input: {
    readonly request: AgentRequest;
    readonly recentTurns: readonly string[];
    readonly baselineReply: string;
    readonly pendingAction?: ConversationResponderInput["pendingAction"];
    readonly pendingWorkflowReference?: ConversationResponderInput["pendingWorkflowReference"];
    readonly conversationSavingsEvents?: ConversationResponderInput["conversationSavingsEvents"];
    readonly financialContext?: VictoriaConversationContext;
    readonly contextSnapshot?: ConversationContextSnapshot;
  }): Promise<AgentResponse> {
    let memory = input.contextSnapshot ? undefined : await this.memory.getMemoryForUser(input.request.userId, input.request.message);
    if (memory?.conversationalMemories?.some((item) => item.sourceMetadata?.memoryKind === "episodic_summary")) {
      const lifecycleMemories = await this.memory.listCurrentConversationalMemories?.(input.request.userId, true) ?? [];
      memory = {
        ...memory,
        conversationalMemories: [...suppressLifecycleConflictingEpisodes(memory.conversationalMemories, lifecycleMemories)]
      };
    }
    const suppliedFinancialContext = input.financialContext ?? input.contextSnapshot?.financialContext;
    const responderFinancialContext = suppliedFinancialContext
      ? input.conversationSavingsEvents ? suppliedFinancialContext : withoutConversationEventHistory(suppliedFinancialContext)
      : buildVictoriaConversationContext({
          priorTurns: input.recentTurns,
          turnContext: buildTurnContext({ message: input.request.message, priorTurns: input.recentTurns }),
          message: input.request.message,
          selectedMemories: memory?.conversationalMemories ?? [],
          // Historical event data is exposed only when the caller explicitly resolved an event-history request.
          savingsEvents: []
        });
    let contextSnapshot = input.contextSnapshot;
    const snapshotHasEventHistory = Boolean(contextSnapshot?.conversationSavingsEvents?.length ||
      contextSnapshot?.financialContext?.conversationSavingsEvents.length ||
      contextSnapshot?.references?.historicalEvent);
    if (contextSnapshot && snapshotHasEventHistory && !input.conversationSavingsEvents) {
      contextSnapshot = snapshotWithoutEventHistory(contextSnapshot, responderFinancialContext);
    }
    if (!contextSnapshot?.turnUnderstanding) {
      contextSnapshot ??= buildConversationContextSnapshot({
        message: input.request.message,
        recentTurns: input.recentTurns,
        memories: input.contextSnapshot?.selectedMemories ??
          conversationResponderMemories(memory?.conversationalMemories ?? [], responderFinancialContext, input.request.message),
        episodicSummaries: input.contextSnapshot?.episodicSummaries ??
          selectConversationEpisodeSummaries(memory?.conversationalMemories ?? [], input.request.message),
        ...(input.contextSnapshot?.responsePreference
          ? { responsePreference: input.contextSnapshot.responsePreference }
          : conversationResponsePreferenceInput(memory?.conversationalMemories ?? [])),
        ...(input.pendingAction ? { pendingAction: input.pendingAction } : {}),
        ...(input.pendingWorkflowReference ? { pendingWorkflowReference: input.pendingWorkflowReference } : {}),
        ...(input.conversationSavingsEvents ? { conversationSavingsEvents: input.conversationSavingsEvents } : {}),
        financialContext: responderFinancialContext
      });
      const interpretation = await this.turnUnderstanding.understand({
        contextSnapshot,
        fallback: buildConversationIntentPlan({
          message: input.request.message,
          recentTurns: input.recentTurns,
          hasPendingWorkflow: input.pendingAction !== undefined
        })
      });
      contextSnapshot = Object.freeze({
        ...contextSnapshot,
        turnUnderstanding: interpretation.plan,
        turnUnderstandingSource: interpretation.source
      });
    }
    const verifiedCalculation = calculateReadOnlySavingsQuestion(input.request.message);
    const message = await this.replies.respond({
      message: input.request.message,
      recentTurns: input.recentTurns,
      memories: contextSnapshot?.selectedMemories ??
        conversationResponderMemories(memory?.conversationalMemories ?? [], responderFinancialContext, input.request.message),
      episodicSummaries: contextSnapshot?.episodicSummaries ??
        selectConversationEpisodeSummaries(memory?.conversationalMemories ?? [], input.request.message),
      baselineReply: input.baselineReply,
      ...(contextSnapshot?.responsePreference
        ? { responsePreference: contextSnapshot.responsePreference }
        : conversationResponsePreferenceInput(memory?.conversationalMemories ?? [])),
      ...(input.pendingAction ? { pendingAction: input.pendingAction } : {}),
      ...(input.pendingWorkflowReference ? { pendingWorkflowReference: input.pendingWorkflowReference } : {}),
      ...(input.conversationSavingsEvents ? { conversationSavingsEvents: input.conversationSavingsEvents } : {}),
      ...(verifiedCalculation ? { verifiedCalculations: [verifiedCalculation] } : {}),
      financialContext: responderFinancialContext,
      ...(contextSnapshot ? { contextSnapshot } : {})
    });
    return { message, decision: {
      action: "reflect",
      classification: { type: "general_finance", confidence: 1, summary: input.request.message, needsClarification: false },
      userFacingMessage: message
    } };
  }
}

export function conversationResponderMemories(
  memories: readonly ConversationalMemory[],
  financialContext: VictoriaConversationContext | undefined,
  query?: string
): readonly ConversationResponderMemory[] {
  if (financialContext) {
    const selected = financialContext.selectedMemoryFacts.map(({ id, key, value, provenance, selectionReasons }) => ({
      id, key, value, provenance, ...(selectionReasons ? { selectionReasons } : {})
    }));
    const selectedIds = new Set(selected.map((memory) => memory.id));
    // Preserve relevant non-financial facts omitted by financial-only retrieval without leaking unrelated memories.
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

export function withoutConversationEventHistory(context: VictoriaConversationContext): VictoriaConversationContext {
  return {
    relevantUserTurns: context.relevantUserTurns,
    financialFacts: context.financialFacts,
    selectedMemoryFacts: context.selectedMemoryFacts,
    conversationSavingsEvents: [],
    ...(context.workflowState ? { workflowState: context.workflowState } : {})
  };
}

function snapshotWithoutEventHistory(
  snapshot: ConversationContextSnapshot,
  financialContext: VictoriaConversationContext
): ConversationContextSnapshot {
  const { conversationSavingsEvents, references, turnUnderstanding, turnUnderstandingSource, ...safeSnapshot } = snapshot;
  void conversationSavingsEvents;
  void turnUnderstanding;
  void turnUnderstandingSource;
  const { historicalEvent, ...safeReferences } = references ?? {};
  void historicalEvent;
  const dialogueState = snapshot.dialogueState
    ? Object.freeze({
        ...snapshot.dialogueState,
        referencedEntities: Object.freeze(snapshot.dialogueState.referencedEntities.filter(({ kind }) => kind !== "savings_event"))
      })
    : undefined;
  return Object.freeze({
    ...safeSnapshot,
    financialContext,
    ...(dialogueState ? { dialogueState } : {}),
    ...(Object.keys(safeReferences).length ? { references: Object.freeze(safeReferences) } : {})
  });
}

export function selectConversationEpisodeSummaries(
  memories: readonly ConversationalMemory[],
  message: string
): NonNullable<ConversationResponderInput["episodicSummaries"]> {
  return memories.filter((memory) => isUsableEpisodicSummary(memory, message))
    .slice(0, 3)
    .map(({ id, value, createdAt }) => ({ id, summary: value, createdAt }));
}

export function conversationResponsePreferenceInput(
  memories: readonly ConversationalMemory[]
): Pick<ConversationResponderInput, "responsePreference"> | Record<string, never> {
  const preferences = memories.filter((memory) => isRetrievableMemory(memory) && memory.category === "preference" &&
    /^(?:communication:brief|communication:detailed|response_style)$/i.test(memory.key));
  const current = [...preferences].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt))[0];
  if (!current) return {};
  const statement = `${current.key} ${current.value} ${current.evidence}`.toLocaleLowerCase("en-US");
  if (/\b(?:brief|briefly|concise|short replies|short check-ins)\b/.test(statement)) return { responsePreference: "brief" };
  if (/\b(?:detailed|in-depth|thorough|more explanation|longer replies)\b/.test(statement)) return { responsePreference: "detailed" };
  return {};
}
