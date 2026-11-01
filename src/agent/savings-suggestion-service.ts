import { annualizeMonthlyAmountCents } from "../domain/money.js";
import { selectFinancialContextSource } from "./context-source-policy.js";
import { freedRecurringSpend } from "./money-movement-intent.js";
import { PendingAmountClarificationService } from "./pending-amount-clarification-service.js";
import { PendingSavingsProposalService } from "./pending-savings-proposal-service.js";
import { MerchantSpendMemoryService } from "./memory/merchant-spend-memory-service.js";
import { sanitizeMemoryEvidence } from "./memory/personalized-ordinary-reply.js";
import { isUsableTransactionHistoryEstimate, type TransactionHistoryProvider } from "./transaction-history-provider.js";
import { buildSavingsSuggestionDecision } from "./savings-suggestion-decision-builder.js";
import { validateSavingsSuggestion } from "./validation.js";
import type { TeamAdvice } from "./response-composition.js";
import type { VictoriaTools } from "./tools/contracts.js";
import type { AgentDecision, AgentRequest, ClassifiedMessage, SavingsEvent } from "./types.js";

/** Selects grounded estimate evidence and creates an approval-gated savings proposal. */
export class SavingsSuggestionService {
  constructor(private readonly dependencies: {
    readonly tools: Pick<VictoriaTools, "estimateAvoidedSpend" | "findTypicalMerchantSpend">;
    readonly merchantSpendMemory: Pick<MerchantSpendMemoryService, "findTypicalSpend" | "findHabitEvidence">;
    readonly transactionHistory?: TransactionHistoryProvider;
    readonly pendingAmountClarifications: Pick<PendingAmountClarificationService, "set">;
    readonly pendingSavingsProposals: Pick<PendingSavingsProposalService, "set">;
    readonly buildSavingsEvent: (request: AgentRequest, classification: ClassifiedMessage) => SavingsEvent;
    readonly clearRecentSavingsEntry: (request: AgentRequest) => void;
    readonly conversationKey: (request: AgentRequest) => string;
    readonly createId: (namespace: "savings_action" | "proposal") => string;
    readonly now?: () => string;
  }) {}

  async suggest(input: {
    readonly request: AgentRequest;
    readonly classification: ClassifiedMessage;
    readonly existingSavingsEvent?: SavingsEvent;
    readonly teamAdvice?: TeamAdvice;
  }): Promise<AgentDecision> {
    const { request, classification, teamAdvice } = input;
    const savingsEvent = input.existingSavingsEvent ?? this.dependencies.buildSavingsEvent(request, classification);
    this.dependencies.clearRecentSavingsEntry(request);
    const rememberedTypicalAmountCents = classification.merchantName
      ? await this.dependencies.merchantSpendMemory.findTypicalSpend(request.userId, classification.merchantName)
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
      ...(classification.amountCents !== undefined ? { userProvidedAmountCents: classification.amountCents } : {})
    });

    if (!suggestion || !validateSavingsSuggestion(suggestion)) {
      await this.dependencies.pendingAmountClarifications.set(request, { classification, savingsEvent });
      const rememberedMerchantHabit = !suggestion && classification.merchantName
        ? await this.dependencies.merchantSpendMemory.findHabitEvidence(request.userId, classification.merchantName)
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
        await this.dependencies.pendingAmountClarifications.set(request, { classification, savingsEvent });
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

    const baseDecision = buildSavingsSuggestionDecision({
      classification,
      savingsEvent,
      suggestion,
      actionId: this.dependencies.createId("savings_action"),
      proposalId: this.dependencies.createId("proposal"),
      createdAt: (this.dependencies.now ?? (() => new Date().toISOString()))()
    });
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
      this.dependencies.pendingSavingsProposals.set(actionId, {
        userId: request.userId,
        conversationKey: this.dependencies.conversationKey(request),
        decision
      });
    }
    return decision;
  }
}
