import { formatUsd } from "../domain/money.js";
import { parseExplicitDollarAmount } from "../domain/financial-events/parse-explicit-amount.js";
import { employerCoveredRecurringSpend } from "./money-movement-intent.js";
import {
  extractConversationalMemory,
  extractConversationalMemories,
  extractConversationalSpendCorrection,
  extractMerchantSpendClaim,
  type ConversationalSpendCorrection,
  type ExtractedConversationalMemory
} from "./memory/extract-preference.js";
import {
  isExplicitInterestCorrectionEvidence,
  isExplicitUserEvidence
} from "./memory/conversational-memory-extractor.js";
import { withCurrentTurnEvidence } from "./memory/memory-learning-service.js";
import type { MemoryProvider } from "./memory/types.js";
import { isUsableTransactionHistoryEstimate, type TransactionHistoryProvider } from "./transaction-history-provider.js";
import type { AgentRequest } from "./types.js";

export interface ConversationMemoryCaptureResult {
  readonly spendCorrection: ConversationalSpendCorrection | null;
  readonly interestSavedThisTurn: boolean;
  readonly acknowledgement?: string;
  readonly isMixedFinancialTurn: boolean;
}

/** Captures explicit, evidence-backed memory from the current turn without owning financial workflows. */
export class ConversationMemoryCaptureService {
  constructor(private readonly dependencies: {
    readonly memory: Pick<MemoryProvider, "listConversationalMemories" | "rememberConversationalMemory">;
    readonly transactionHistory?: TransactionHistoryProvider;
  }) {}

  async capture(input: {
    readonly request: AgentRequest;
    readonly skipDirectCapture?: boolean;
    readonly deferMixedFactToProvider?: boolean;
  }): Promise<ConversationMemoryCaptureResult> {
    const { request } = input;
    const spendCorrection = extractConversationalSpendCorrection(request.message);
    const directCandidate = input.skipDirectCapture ? null : extractConversationalMemory(request.message);
    const deferMixedFactToProvider = directCandidate && directCandidate.category !== "other" &&
      input.deferMixedFactToProvider && directCandidate.evidence.trim() !== request.message.trim() &&
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
      await this.rememberIfChanged(request.userId, interestMemory, request);
    }

    if (!extractedMemory || interestDuringCoveredSpend) {
      return {
        spendCorrection,
        interestSavedThisTurn: interestDuringCoveredSpend,
        isMixedFinancialTurn: false
      };
    }

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
            value: matches ? extractedMemory.value : `Usually spends ${checkedAmount} at ${merchantSpendClaim.merchantName}.`,
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

    await this.rememberIfChanged(request.userId, memoryToRemember, request);
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
      await this.rememberIfChanged(request.userId, candidate, request);
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
    const isMixedFinancialTurn = extractedMemory.evidence.trim() !== request.message.trim() &&
      parseExplicitDollarAmount(request.message).status === "valid";
    return { spendCorrection, interestSavedThisTurn: false, acknowledgement: message, isMixedFinancialTurn };
  }

  private async rememberIfChanged(userId: string, candidate: ExtractedConversationalMemory, request: AgentRequest): Promise<void> {
    const existing = await this.dependencies.memory.listConversationalMemories(userId);
    const prior = [...existing].reverse().find((item) => item.category === candidate.category && item.key === candidate.key);
    if (prior?.value === candidate.value && prior.evidence === candidate.evidence) return;
    await this.dependencies.memory.rememberConversationalMemory(userId, {
      ...withCurrentTurnEvidence(candidate, request),
      ...(prior ? { supersedesId: prior.id } : {})
    });
  }
}

function isMateriallyDifferentSpend(transactionAmountCents: number, statedAmountCents: number): boolean {
  const toleranceCents = Math.max(100, Math.round(statedAmountCents * 0.15));
  return Math.abs(transactionAmountCents - statedAmountCents) >= toleranceCents;
}
