import { annualizeMonthlyAmountCents } from "../domain/money.js";
import { parseExplicitDollarAmount } from "../domain/financial-events/parse-explicit-amount.js";
import type { LlmAdapter } from "./llm/types.js";
import type { AgentMemory, ClassifiedMessage } from "./types.js";
import { isMemoryTopicMatched } from "./memory/personalized-ordinary-reply.js";
import { employerCoveredRecurringSpend, freedRecurringSpend, isBudgetingAdviceQuestion, isExplicitRealMoneyMovementRequest, isRealMoneyMovementRequest } from "./money-movement-intent.js";
import { getPriorCoveredExpenseAllocation } from "./memory/covered-expense-allocation-memory-service.js";
import { applyClassificationConfidencePolicy } from "./confidence-policy.js";
import { resolveFinancialReferenceHint } from "./conversation-context-builder.js";
import { buildConversationContextSnapshot, type ConversationContextSnapshot } from "./conversation-responder.js";
import { conversationResponderMemories } from "./conversation-turn-reply-service.js";
import { clarificationAfterSpecialistFailure, fallbackFinding, groundExplicitAvoidedSpendAmount, validateTeamAssessment, validateTeamFinding } from "./team-assessment-policy.js";
import { finalizeCompanionResponse, requiredDisclosures, voiceDraftRevisionFeedback, type VoiceDraftIssue } from "./team-response-policy.js";
import type { AgentTeamSpecialists, SavingsAssessment } from "./team-prototype.js";
import { validateClassifiedMessage } from "./validation.js";
import { resolveCoveredSpendPeriodAnswer } from "./conversation-dialogue-policy.js";
import type { ResolvedFinancialReference, VictoriaConversationContext } from "./conversation-context-builder.js";

export interface FinancialTurnAssessment {
  readonly classification: ClassifiedMessage;
  readonly teamAdvice?: {
    readonly assessment: SavingsAssessment;
    readonly message: string;
    readonly awaitingAllocationTargetChoice?: boolean;
  };
  readonly resolvedReference?: ResolvedFinancialReference;
}

/** Coordinates provider classification and advisory specialists before deterministic workflow policy runs. */
export class FinancialTurnAssessmentService {
  constructor(private readonly dependencies: {
    readonly llm: LlmAdapter;
    readonly specialists?: AgentTeamSpecialists;
    readonly onFinancialMomentFallback?: (source: "classifier" | "specialist") => void;
    readonly onCompanionVoiceValidationFailure?: (issues: readonly VoiceDraftIssue[]) => void;
  }) {}

  async assess(input: {
    readonly message: string;
    readonly memory: AgentMemory;
    readonly conversationContext?: readonly string[];
    readonly financialContext?: VictoriaConversationContext;
    readonly contextSnapshot?: ConversationContextSnapshot;
  }): Promise<FinancialTurnAssessment> {
    const { message, memory } = input;
    const conversationContext = input.conversationContext ?? [];
    const financialContext = input.financialContext;
    const specialists = this.dependencies.specialists;
    const contextSnapshot = input.contextSnapshot ?? buildConversationContextSnapshot({
      message,
      recentTurns: conversationContext,
      memories: conversationResponderMemories(memory.conversationalMemories ?? [], financialContext, message),
      ...(financialContext ? { financialContext } : {})
    });
    const specialistFinancialContext = contextSnapshot.financialContext ?? financialContext;

    if (!specialists) {
      let candidate: ClassifiedMessage;
      try {
        candidate = await this.dependencies.llm.classifyMessage({ userMessage: message, memory, contextSnapshot, conversationContext,
          ...(specialistFinancialContext ? { financialContext: specialistFinancialContext } : {}) });
      } catch {
        this.reportFinancialMomentFallback("classifier");
        candidate = fallbackFinding(message).classification;
      }
      const validated = validateClassifiedMessage(candidate) ?? fallbackFinding(message).classification;
      const resolvedReference = resolveFinancialReferenceHint(financialContext, validated.referenceHint);
      const cleanClassification = { ...groundExplicitAvoidedSpendAmount(validated, message) };
      delete cleanClassification.referenceHint;
      const classification = enforceMoneyMovementBoundary(message, cleanClassification, contextSnapshot);
      return {
        classification: applyClassificationConfidencePolicy(classification),
        ...(resolvedReference ? { resolvedReference } : {})
      };
    }

    let finding;
    let financialMomentValid = false;
    try {
      const candidate = await specialists.financialMoment.analyze({ message, memory, conversationContext, contextSnapshot,
        ...(specialistFinancialContext ? { financialContext: specialistFinancialContext } : {}) });
      const validated = validateTeamFinding(candidate, financialContext);
      finding = validated ?? fallbackFinding(message);
      financialMomentValid = validated !== null;
    } catch {
      this.reportFinancialMomentFallback("specialist");
      finding = fallbackFinding(message);
    }
    finding = { ...finding, classification: groundExplicitAvoidedSpendAmount(finding.classification, message) };
    const classification = enforceMoneyMovementBoundary(
      message, applyClassificationConfidencePolicy(finding.classification), contextSnapshot
    );
    const coveredSpend = freedRecurringSpend(message);
    const periodAnswer = resolveCoveredSpendPeriodAnswer(classification, message, conversationContext);
    if (periodAnswer !== classification) {
      return { classification: periodAnswer, ...(finding.resolvedReference ? { resolvedReference: finding.resolvedReference } : {}) };
    }
    if (coveredSpend && classification.type === "avoided_spend" &&
        classification.amountCents === coveredSpend.amountCents && classification.amountIssue === undefined) {
      // Explicit recurring-cost evidence remains sufficient for this supported financial moment.
      financialMomentValid = true;
    }
    const interests = (memory.conversationalMemories ?? [])
      .filter((item) => item.category === "other" && item.key.startsWith("interest:") &&
        item.sourceMetadata?.interestStatus !== "inactive" && isMemoryTopicMatched(item, message))
      .map((item) => item.value.replace(/^Enjoys\s+|\.$/g, ""))
      .slice(0, 3);
    const annualProjection = coveredSpend?.cadence === "month" && Number.isSafeInteger(coveredSpend.amountCents * 12)
      ? annualizeMonthlyAmountCents(coveredSpend.amountCents) : undefined;
    const responseContext = {
      ...(annualProjection === undefined ? {} : {
        validatedAdditionalAmountsCents: [annualProjection], validatedAnnualProjectionCents: annualProjection
      }),
      ...(interests.length === 0 ? {} : { rememberedInterests: interests }),
      ...(employerCoveredRecurringSpend(message) ? getPriorCoveredExpenseAllocation(memory.conversationalMemories ?? []) : {}),
      ...(coveredSpend && classification.type === "avoided_spend" ? { awaitingAllocationTargetChoice: true } : {})
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
        outcome: "suggest", confidence: 1, amountCents: coveredSpend.amountCents, source: "user_provided",
        rationale: "The user stated the recurring monthly amount."
      };
    } else {
      try {
        const candidate = await specialists.savingsReasoning.assess({ finding, memory, contextSnapshot,
          ...(specialistFinancialContext ? { financialContext: specialistFinancialContext } : {}) });
        assessment = validateTeamAssessment(candidate, finding, memory);
        savingsAssessmentValidated = true;
      } catch {
        assessment = clarificationAfterSpecialistFailure("savingsReasoning");
      }
    }
    if (savingsAssessmentValidated && assessment.outcome === "ask" && classification.type === "avoided_spend" &&
        !classification.needsClarification && classification.amountIssue === undefined && classification.amountCents !== undefined) {
      const explicitAmount = parseExplicitDollarAmount(message);
      const asksToRepeatKnownAmount = /\b(?:clarify|confirm|make sure)\b.{0,60}\b(?:amount|it)\b|\b(?:which|what) amount\b.{0,40}\b(?:use|should|did)\b/i
        .test(assessment.question);
      if (explicitAmount.status === "valid" && explicitAmount.amountCents === classification.amountCents && asksToRepeatKnownAmount) {
        assessment = {
          outcome: "suggest", confidence: classification.confidence, amountCents: classification.amountCents,
          source: "user_provided",
          rationale: "The follow-up asked for an amount already explicitly stated and validated in the current message."
        };
      }
    }
    if (assessment.outcome === "ask") return {
      classification,
      teamAdvice: { assessment, message: assessment.question },
      ...(finding.resolvedReference ? { resolvedReference: finding.resolvedReference } : {})
    };

    const disclosures = requiredDisclosures(finding, assessment);
    let draft: unknown;
    let voiceCallSucceeded = false;
    try {
      draft = await specialists.companionVoice.respond({ finding, assessment, requiredDisclosures: disclosures, contextSnapshot });
      voiceCallSucceeded = true;
    } catch { draft = undefined; }
    let finalized = finalizeCompanionResponse(draft, finding, assessment);
    for (let revisionNumber = 0; voiceCallSucceeded && revisionNumber < 1 && !finalized.voiceDraftAccepted; revisionNumber += 1) {
      try {
        const revision = await specialists.companionVoice.respond({ finding, assessment, requiredDisclosures: disclosures,
          revisionFeedback: voiceDraftRevisionFeedback(finalized.validationIssues), contextSnapshot });
        voiceCallSucceeded = true;
        finalized = finalizeCompanionResponse(revision, finding, assessment);
      } catch { voiceCallSucceeded = false; break; }
    }
    if (voiceCallSucceeded && !finalized.voiceDraftAccepted) {
      try { this.dependencies.onCompanionVoiceValidationFailure?.(finalized.validationIssues); }
      catch { /* Diagnostics are best-effort. */ }
    }
    if (finalized.voiceDraftAccepted && finalized.validationIssues.length > 0) {
      console.info("Victoria companion voice added a required ledger confirmation to the generated reply.", {
        adjustments: finalized.validationIssues
      });
    }
    return {
      classification,
      ...(finding.resolvedReference ? { resolvedReference: finding.resolvedReference } : {}),
      teamAdvice: { assessment, message: finalized.message,
        ...(finding.responseContext?.awaitingAllocationTargetChoice ? { awaitingAllocationTargetChoice: true } : {}) }
    };
  }

  private reportFinancialMomentFallback(source: "classifier" | "specialist"): void {
    try { this.dependencies.onFinancialMomentFallback?.(source); }
    catch { /* Safe fallback telemetry cannot block a conservative answer. */ }
  }
}

function isTeamSupportedClassification(classification: ClassifiedMessage): boolean {
  if (classification.type === "avoided_spend" || classification.type === "regretful_spend") return true;
  if (classification.type === "unclear" && classification.uncertainIntent) return false;
  return classification.type === "unclear" && classification.amountCents === undefined;
}

function enforceMoneyMovementBoundary(
  message: string,
  classification: ClassifiedMessage,
  contextSnapshot: ConversationContextSnapshot
): ClassifiedMessage {
  const coveredSpend = freedRecurringSpend(message);
  const explicitTransfer = isExplicitRealMoneyMovementRequest(message);
  const realMoneyIntent = isRealMoneyMovementRequest(message);
  if (coveredSpend && !explicitTransfer && (!realMoneyIntent || isBudgetingAdviceQuestion(message))) {
    return { type: "avoided_spend", confidence: Math.max(classification.confidence, 0.95),
      amountCents: coveredSpend.amountCents, summary: message, needsClarification: false };
  }
  if (!explicitTransfer && !realMoneyIntent) {
    if (classification.type !== "real_money_movement_request") return classification;
    const advisoryPlan = contextSnapshot.turnUnderstanding;
    if (advisoryPlan &&
        ["dialogue", "financial_reflection", "planning"].includes(advisoryPlan.primaryIntent) &&
        advisoryPlan.requestedAction === "none" &&
        !advisoryPlan.uncertainty.needsClarification) {
      return {
        type: "general_finance", confidence: Math.min(classification.confidence, 0.9),
        summary: classification.summary || message, needsClarification: false
      };
    }
    return {
      type: "unclear", confidence: Math.min(classification.confidence, 0.7),
      uncertainIntent: "real_money_movement_request", summary: classification.summary || message,
      needsClarification: true
    };
  }
  return { type: "real_money_movement_request", confidence: 1, summary: classification.summary || message,
    needsClarification: false };
}
