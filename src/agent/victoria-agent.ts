import { createHash } from "node:crypto";
import type { LlmAdapter } from "./llm/types.js";
import type { MemoryProvider } from "./memory/types.js";
import { MemoryOrchestrator } from "./memory/memory-orchestrator.js";
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
  SavingsGoal,
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
  extractConversationalSpendCorrection,
  extractMerchantSpendClaim,
  merchantHabitMemoryKey,
  merchantSpendMemoryKey
} from "./memory/extract-preference.js";
import { selectFinancialContextSource } from "./context-source-policy.js";
import { isUsableTransactionHistoryEstimate, type TransactionHistoryProvider } from "./transaction-history-provider.js";
import { isRealMoneyMovementRequest } from "./money-movement-intent.js";
import { isExplicitUserEvidence, validateMemoryCandidates, type ConversationalMemoryExtractor } from "./memory/conversational-memory-extractor.js";
import { isUsableEpisodicSummary, validateEpisodicSummary, type EpisodicMemorySummarizer } from "./memory/episodic-summary.js";
import { parseMemoryControlIntent } from "./memory/memory-control-intent.js";

export interface VictoriaAgentDependencies {
  llm: LlmAdapter;
  memory: MemoryProvider;
  tools: VictoriaTools;
  /** Optional specialist advisory stack; core workflow and all mutations stay deterministic. */
  specialists?: AgentTeamSpecialists;
  transactionHistory?: TransactionHistoryProvider;
  /** Optional model-backed extractor for stable contextual memories from ordinary conversation. */
  conversationalMemoryExtractor?: ConversationalMemoryExtractor;
  episodicMemorySummarizer?: EpisodicMemorySummarizer;
}

interface TeamAdvice {
  assessment: SavingsAssessment;
  message: string;
}

export class VictoriaAgent {
  private readonly dependencies: VictoriaAgentDependencies;
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
  private readonly pendingGoalCreations = new Map<string, { userId: string; actionId: string; goal: Omit<SavingsGoal, "userId" | "savedAmountCents"> }>();
  private nextGoalCreationNumber = 1;
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
    this.dependencies = {
      ...dependencies,
      memory: dependencies.memory instanceof MemoryOrchestrator
        ? dependencies.memory
        : new MemoryOrchestrator(dependencies.memory)
    };
  }

  async respond(request: AgentRequest): Promise<AgentResponse> {
    const conversationId = request.conversationId ?? "default";
    const priorContext = await this.dependencies.memory.getConversationContext(request.userId, conversationId);
    await this.summarizeOverflowingConversation(request.userId, priorContext);
    const withUserMessage = [...priorContext, request.message].slice(-DEFAULT_CONVERSATION_CONTEXT_LIMIT);
    await this.dependencies.memory.setConversationContext(request.userId, conversationId, withUserMessage);
    const response = immutableSnapshot(await this.respondTurn(request, priorContext));
    await this.dependencies.memory.setConversationContext(request.userId, conversationId,
      [...withUserMessage, `Victoria: ${response.message}`].slice(-DEFAULT_CONVERSATION_CONTEXT_LIMIT));
    return response;
  }

  private async summarizeOverflowingConversation(userId: string, context: readonly string[]): Promise<void> {
    if (await this.dependencies.memory.isMemoryPaused(userId)) return;
    const summarizer = this.dependencies.episodicMemorySummarizer;
    if (!summarizer || context.length < DEFAULT_CONVERSATION_CONTEXT_LIMIT) return;
    const userMessages = context.slice(-8)
      .filter((message) => !/^Victoria:/i.test(message))
      .filter(isEpisodicSummaryEligible)
      .slice(0, 8);
    if (userMessages.length < 2) return;
    try {
      const candidate = validateEpisodicSummary(await summarizer.summarize({ userMessages }), userMessages);
      if (!candidate) return;
      const digest = createHash("sha256").update(userId).update("\0").update(userMessages.join("\0")).digest("hex").slice(0, 24);
      await this.dependencies.memory.rememberConversationalMemory(userId, {
        ...candidate,
        key: `episode:${digest}`
      });
    } catch {
      // Episodic summarization is optional and cannot interrupt an ordinary turn.
    }
  }

  private async respondTurn(request: AgentRequest, conversationContext: readonly string[]): Promise<AgentResponse> {
    const memoryPaused = await this.dependencies.memory.isMemoryPaused(request.userId);
    const conversationKey = this.conversationKey(request);
    const pendingGoalCreation = this.pendingGoalCreations.get(conversationKey);
    if (pendingGoalCreation?.userId === request.userId) {
      const answer = interpretApprovalResponse(request.message);
      const newGoalStatement = extractConversationalMemory(request.message)?.category === "goal";
      if (newGoalStatement && answer === "not_approval") this.pendingGoalCreations.delete(conversationKey);
      else {
      if (answer === "explicit_approval") {
        const toolCall = { name: "createSavingsGoal" as const, actionId: pendingGoalCreation.actionId,
          arguments: { ...pendingGoalCreation.goal }, requiresApproval: true };
        const allowed = canCallTool({ ...request, approvedActionId: pendingGoalCreation.actionId }, toolCall);
        if (!allowed.allowed) return this.refuseApproval({ action: "update_goal", classification: { type: "general_finance", confidence: 1, summary: request.message, needsClarification: false }, toolCall, userFacingMessage: allowed.reason ?? "I couldn't approve that goal." }, allowed.reason ?? "I couldn't approve that goal.");
        try {
          const goal = await this.dependencies.memory.createSavingsGoal(request.userId, pendingGoalCreation.goal, pendingGoalCreation.actionId);
          this.pendingGoalCreations.delete(conversationKey);
          const message = `I added “${goal.name}” as a savings goal${goal.targetAmountCents === undefined ? "" : ` with a target of ${formatUsd(goal.targetAmountCents)}`}. This only creates a goal in your mocked savings ledger; no money has moved. You can ask me to allocate a recorded savings entry to it, and I’ll ask for separate confirmation.`;
          return { message, decision: { action: "update_goal", classification: { type: "general_finance", confidence: 1, summary: request.message, needsClarification: false }, savingsGoal: goal, toolCall, userFacingMessage: message } };
        } catch {
          const message = "I couldn't add that savings goal just now. It wasn't created; you can ask me to try again.";
          return { message, decision: { action: "ask_follow_up", classification: { type: "general_finance", confidence: 1, summary: request.message, needsClarification: false }, userFacingMessage: message } };
        }
      }
      if (answer === "explicit_decline") {
        this.pendingGoalCreations.delete(conversationKey);
        const message = "No problem. I’ll keep it as conversational memory and won’t create a structured savings goal.";
        return { message, decision: { action: "reflect", classification: { type: "general_finance", confidence: 1, summary: request.message, needsClarification: false }, userFacingMessage: message } };
      }
      const message = "Would you like me to add that as a structured savings goal? Please answer yes or no.";
      return { message, decision: { action: "ask_follow_up", classification: { type: "general_finance", confidence: 1, summary: request.message, needsClarification: false }, userFacingMessage: message } };
      }
    }
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

    const memoryControl = parseMemoryControlIntent(request.message);
    if (memoryControl && !pendingCorrection && !pendingGoalAction && !pendingAction) {
      const memories = await this.dependencies.memory.listConversationalMemories(request.userId);
      if (memoryControl.type === "pause" || memoryControl.type === "resume") {
        const paused = memoryControl.type === "pause";
        await this.dependencies.memory.setMemoryPaused(request.userId, paused);
        const message = paused
          ? "Memory is paused. I won't learn or use conversational memories until you ask me to resume."
          : "Memory is resumed. I can learn from relevant details you share in conversation again.";
        return this.memoryControlResponse(request, message);
      }
      if (memoryControl.type === "forget_all") {
        const removed = await this.dependencies.memory.forgetAllConversationalMemories(request.userId);
        const message = `I forgot ${removed} conversational memor${removed === 1 ? "y" : "ies"}. Your financial records and any connected transaction profile are separate.`;
        return this.memoryControlResponse(request, message);
      }
      if (memoryControl.type === "review") {
        const current = memories.filter((item) => !item.supersedesId || !memories.some((newer) => newer.supersedesId === item.id));
        const message = current.length
          ? `Here's what I currently remember:\n${current.map((item) => `• ${item.value}${item.sourceType === "plaid_transaction_profile" ? " (from your connected transaction profile)" : ""}`).join("\n")}\nYou can correct any of this or ask me to forget something.`
          : "I don't have any current conversational memories saved. You can tell me what to remember, or ask me to pause memory.";
        return this.memoryControlResponse(request, message);
      }
      const query = memoryControl.target.toLocaleLowerCase("en-US").split(/[^a-z0-9]+/).filter((word) => word.length > 2);
      const candidates = memories.filter((item) => item.sourceType !== "plaid_transaction_profile" &&
        query.some((word) => `${item.value} ${item.key}`.toLocaleLowerCase("en-US").includes(word)));
      if (candidates.length !== 1) {
        const message = candidates.length > 1
          ? `I found more than one memory that could match. Which one should I forget? ${candidates.map((item) => `“${item.value}”`).join("; „")}`
          : "I couldn't identify a specific conversational memory to forget. What detail would you like me to forget?";
        return this.memoryControlResponse(request, message, "ask_follow_up");
      }
      await this.dependencies.memory.forgetConversationalMemory(request.userId, candidates[0]!.id);
      return this.memoryControlResponse(request, `I forgot “${candidates[0]!.value}”.`);
    }


    const spendCorrection = extractConversationalSpendCorrection(request.message);
    if (spendCorrection && !memoryPaused && !pendingCorrection && !pendingGoalAction && !pendingAction) {
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

    const extractedCandidate = memoryPaused ? null : extractConversationalMemory(request.message);
    const extractedMemory = extractedCandidate && extractedCandidate.evidence.length <= 240 &&
      isExplicitUserEvidence(request.message, extractedCandidate.evidence) ? extractedCandidate : null;
    if (extractedMemory) {
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
          ...memoryToRemember,
          ...(prior ? { supersedesId: prior.id } : {})
        });
      }
      const message = acknowledgement ?? (merchantSpendClaim?.isSpeculative
        ? `I'll keep ${formatUsd(merchantSpendClaim.amountCents)} at ${merchantSpendClaim.merchantName} as an unverified estimate for now.`
        : `Got it. I'll remember: “${memoryToRemember.value}”`);
      const classification: ClassifiedMessage = {
        type: "general_finance", confidence: 1, summary: request.message, needsClarification: false
      };
      if (pendingCorrection || pendingGoalAction || pendingAction) {
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
      if (memoryToRemember.category === "goal") {
        const name = memoryToRemember.key === "emergency_fund" ? "Emergency fund" : goalNameFromMemoryKey(memoryToRemember.key);
        const amountMatch = /\$\s*(\d[\d,]*(?:\.\d{1,2})?)/.exec(request.message);
        const targetAmountCents = amountMatch?.[1] ? Math.round(Number(amountMatch[1].replaceAll(",", "")) * 100) : undefined;
        const actionId = `savings_goal_create_${this.nextGoalCreationNumber++}`;
        this.pendingGoalCreations.set(conversationKey, { userId: request.userId, actionId,
          goal: { id: `goal_pending_${this.nextGoalCreationNumber - 1}`, name, ...(targetAmountCents ? { targetAmountCents } : {}), currency: "USD" } });
        const prompt = `I’ll remember that goal. Would you like me to add “${name}”${targetAmountCents ? ` with a target of ${formatUsd(targetAmountCents)}` : ""} as a structured savings goal? Please answer yes or no. Creating the goal won’t move money, and allocating recorded savings will still need separate confirmation.`;
        return { message: prompt, decision: { action: "ask_follow_up", classification, userFacingMessage: prompt } };
      }
      return { message, decision: { action: "reflect", classification, userFacingMessage: message } };
    }

    const memory = await this.dependencies.memory.getMemoryForUser(request.userId, request.message);
    const { classification, teamAdvice } = await this.classifyWithTeam(
      request.message, memory, conversationContext
    );
    if (!memoryPaused && classification.type === "general_finance" && this.dependencies.conversationalMemoryExtractor &&
        !pendingCorrection && !pendingGoalAction && !pendingAction) {
      try {
        const candidates = await this.dependencies.conversationalMemoryExtractor.extract({ userMessage: request.message });
        const memories = validateMemoryCandidates(candidates, request.message);
        for (const candidate of memories) {
          await this.dependencies.memory.rememberConversationalMemory(request.userId, candidate);
        }
        if (memories.length > 0) {
          const message = "Got it. I'll keep that in mind for future conversations.";
          return {
            message,
            decision: { action: "reflect", classification, userFacingMessage: message }
          };
        }
      } catch {
        // Optional extraction cannot block an ordinary turn or financial safety checks.
      }
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
      const merchantName = pendingClarification?.classification.merchantName;
      if (merchantName && classification.amountCents !== undefined) {
        await this.rememberMerchantSpendAnswer(request.userId, merchantName, classification.amountCents, request.message);
      }
    } else if (pendingClarification && classification.type !== "unclear") {
      this.pendingAmountClarifications.delete(this.conversationKey(request));
    }

    let decision = await this.decide(request, resolvedClassification, resolvedSavingsEvent, teamAdvice);
    let userFacingMessage = this.teamMessageForDecision(decision, teamAdvice);
    if (decision.action === "reflect" && resolvedClassification.type === "general_finance") {
      const personalizedMessage = personalizeOrdinaryFinancialReply(memory, userFacingMessage, request.message);
      if (personalizedMessage) {
        userFacingMessage = personalizedMessage;
        decision = { ...decision, userFacingMessage };
      }
    }

    return {
      message: userFacingMessage,
      decision: userFacingMessage === decision.userFacingMessage
        ? decision
        : { ...decision, userFacingMessage }
    };
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

  private memoryControlResponse(
    request: AgentRequest,
    message: string,
    action: "reflect" | "ask_follow_up" = "reflect"
  ): AgentResponse {
    const classification: ClassifiedMessage = {
      type: "general_finance", confidence: 1, summary: request.message, needsClarification: action === "ask_follow_up"
    };
    return { message, decision: { action, classification, userFacingMessage: message } };
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
      const classification = enforceMoneyMovementBoundary(message,
        validateClassifiedMessage(candidate) ?? fallbackFinding(message).classification);
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
    const classification = enforceMoneyMovementBoundary(message, applyClassificationConfidencePolicy(finding.classification));
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
      this.pendingAmountClarifications.set(this.conversationKey(request), {
        userId: request.userId,
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

  private async findRememberedMerchantSpend(userId: string, merchantName: string): Promise<number | undefined> {
    if (await this.dependencies.memory.isMemoryPaused(userId)) return undefined;
    const memories = await this.dependencies.memory.listConversationalMemories(userId);
    const key = merchantSpendMemoryKey(merchantName);
    const memory = [...memories].reverse().find((item) => item.category === "habit" && item.key === key && item.confidence >= 0.8);
    const match = memory?.value.match(/^Usually spends \$(\d+(?:\.\d{2})?) at .+\.$/);
    if (!match?.[1]) return undefined;
    const amountCents = Math.round(Number(match[1]) * 100);
    return Number.isSafeInteger(amountCents) && amountCents > 0 ? amountCents : undefined;
  }

  private async findRememberedMerchantHabit(userId: string, merchantName: string): Promise<string | undefined> {
    if (await this.dependencies.memory.isMemoryPaused(userId)) return undefined;
    const memories = await this.dependencies.memory.listConversationalMemories(userId);
    const key = merchantHabitMemoryKey(merchantName);
    return [...memories].reverse().find((item) => item.category === "habit" &&
      item.key === key && item.confidence >= 0.8)?.evidence;
  }

  private async rememberMerchantSpendAnswer(
    userId: string,
    merchantName: string,
    amountCents: number,
    answer: string
  ): Promise<void> {
    if (await this.dependencies.memory.isMemoryPaused(userId)) return;
    if (!Number.isSafeInteger(amountCents) || amountCents <= 0) return;
    const memories = await this.dependencies.memory.listConversationalMemories(userId);
    const key = merchantSpendMemoryKey(merchantName);
    const prior = [...memories].reverse().find((item) => item.category === "habit" && item.key === key);
    const amount = formatUsd(amountCents);
    const value = `Usually spends ${amount} at ${merchantName}.`;
    if (prior?.value === value) return;
    await this.dependencies.memory.rememberConversationalMemory(userId, {
      category: "habit",
      key,
      value,
      evidence: `Asked about typical spend at ${merchantName}; user answered: ${answer}`,
      confidence: 0.9,
      ...(prior ? { supersedesId: prior.id } : {})
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

function personalizeOrdinaryFinancialReply(
  memory: Awaited<ReturnType<MemoryProvider["getMemoryForUser"]>>,
  fallbackMessage: string,
  userMessage: string
): string | undefined {
  const memories = memory.conversationalMemories ?? [];
  const details: string[] = [];
  const routine = memories.find((item) => isRelevantRecurringRoutine(item, userMessage));
  const routineName = routine && describeRecurringRoutine(routine.key);
  if (routineName) details.push(`your ${routineName} routine`);

  const goal = memories.find((item) => item.category === "goal" &&
    (item.key === "emergency_fund" || item.key.startsWith("goal:")) &&
    /\b(?:save|saving|goal|budget|money|financial|fund)\b/i.test(userMessage));
  const goalTarget = goal && (goal.key === "emergency_fund"
    ? "an emergency fund"
    : formatRememberedGoalTarget(goal.key.slice("goal:".length)));
  if (goalTarget) details.push(`your goal of saving for ${goalTarget}`);

  const preference = memories.find((item) => item.category === "preference" && memoryTextMatchesMessage(item, userMessage));
  const preferenceDescription = preference && describeRememberedPreference(preference);
  if (preferenceDescription) details.push(`your preference for ${preferenceDescription}`);

  const episode = memories.find((item) => isUsableEpisodicSummary(item, userMessage));
  if (episode && details.length < 4) details.push(`what you shared before: “${sanitizeMemoryEvidence(episode.value)}”`);

  if (details.length === 0) return fallbackMessage;
  if (details.length === 1 && routineName) {
    return `I remember you’ve mentioned your ${routineName} routine. We can think through what would feel manageable this time. What’s been making it difficult?`;
  }
  if (details.length === 1 && goalTarget) {
    return `I’m here with you. You’ve mentioned saving for ${goalTarget}; we can keep that in mind as we talk this through. What feels most important right now?`;
  }
  if (details.length === 1 && preferenceDescription) {
    return `I’ll keep your preference for ${preferenceDescription} in mind. What would be most helpful right now?`;
  }
  if (details.length === 1 && episode) {
    return `I have a note from an earlier conversation: “${sanitizeMemoryEvidence(episode.value)}” Is that still relevant, or has something changed?`;
  }
  return `You’ve mentioned ${details.slice(0, 4).join(" and ")}. What would feel most helpful to focus on right now?`;
}

function describeRememberedPreference(preference: import("./memory/types.js").ConversationalMemory): string | undefined {
  const raw = preference.key.startsWith("preference:")
    ? preference.key.slice("preference:".length).replace(/_/g, " ")
    : preference.evidence.match(/\bi\s+(?:would\s+|’d\s+)?prefer\s+(?:a\s+|an\s+|the\s+)?([^.!?]+)/i)?.[1]
      ?? preference.evidence.match(/\b([a-z][^,.!?]{1,50}?)\s+(?:is|are)\s+easier\s+for\s+me\b/i)?.[1]?.replace(/^.*\bso\s+/i, "");
  const safe = raw?.replace(/[^a-z0-9 '$.,&-]/gi, " ").replace(/\s+/g, " ").trim().slice(0, 60);
  return safe || undefined;
}

const PERSONALIZATION_STOP_WORDS = new Set([
  "about", "after", "again", "before", "being", "could", "feel", "feels", "from", "have", "help", "here",
  "just", "like", "make", "making", "maybe", "more", "much", "need", "really", "some", "that", "them",
  "then", "they", "this", "through", "want", "what", "when", "with", "would", "your", "money", "financial"
]);

function memoryTextMatchesMessage(memory: import("./memory/types.js").ConversationalMemory, message: string): boolean {
  const terms = (value: string) => new Set(value.toLocaleLowerCase("en-US").match(/[a-z]{4,}/g)
    ?.filter((term) => !PERSONALIZATION_STOP_WORDS.has(term)) ?? []);
  const messageTerms = terms(message);
  const memoryTerms = terms(`${memory.key.replace(/[_:]/g, " ")} ${memory.value} ${memory.evidence}`);
  return [...memoryTerms].some((term) => messageTerms.has(term));
}

function goalNameFromMemoryKey(key: string): string {
  const topic = key.replace(/^goal:/, "").trim();
  const formatted = formatRememberedGoalTarget(topic).replace(/^a /i, "");
  return formatted.split(/\s+/).map((word, index) => word && index > 0 && ["to", "for", "of"].includes(word.toLowerCase())
    ? word.toLowerCase()
    : word ? `${word[0]?.toLocaleUpperCase("en-US")}${word.slice(1)}` : "").join(" ").slice(0, 120) || "Savings goal";
}

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

const ROUTINE_STOP_WORDS = new Set([
  "usually", "often", "typically", "routinely", "regularly", "every", "each", "weekdays", "weekday",
  "weekends", "weekend", "during", "before", "after", "from", "with", "your", "have", "make"
]);

function normalizeRoutineTerm(term: string): string {
  return term.length > 4 ? term.replace(/s$/, "") : term;
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

function enforceMoneyMovementBoundary(message: string, classification: ClassifiedMessage): ClassifiedMessage {
  if (!isRealMoneyMovementRequest(message)) return classification;
  return {
    type: "real_money_movement_request",
    confidence: 1,
    summary: classification.summary || message,
    needsClarification: false
  };
}
