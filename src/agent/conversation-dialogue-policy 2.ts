import { annualizeMonthlyAmountCents } from "../domain/money.js";
import { parseExplicitDollarAmount } from "../domain/financial-events/parse-explicit-amount.js";
import type { AgentDecision, ClassifiedMessage } from "./types.js";
import { freedRecurringSpend } from "./money-movement-intent.js";

/** Resolve a short monthly/annual choice only when Victoria recently asked for it. */
export function isCoveredAllocationTargetChoice(message: string, conversationContext: readonly string[]): boolean {
  const latestChoicePromptIndex = findLatestAllocationTargetPrompt(conversationContext);
  if (latestChoicePromptIndex < 0) return false;
  const planningHorizon = allocationTargetChoice(message);
  if (!planningHorizon) return false;
  const parsedAmount = parseExplicitDollarAmount(message);
  if (parsedAmount.status !== "valid") return true;
  const monthlySpend = [...conversationContext].reverse()
    .map(freedRecurringSpend)
    .find((spend) => spend?.cadence === "month");
  if (!monthlySpend) return false;
  const expectedAmount = planningHorizon === "annual"
    ? annualizeMonthlyAmountCents(monthlySpend.amountCents)
    : monthlySpend.amountCents;
  return parsedAmount.amountCents === expectedAmount;
}

function allocationTargetChoice(message: string): "monthly" | "annual" | undefined {
  const normalized = message.trim().toLowerCase();
  if (!normalized || normalized.length > 180 || /\?/.test(normalized) || /\b(?:not sure|maybe|either|both|compare|what about)\b/.test(normalized)) return undefined;
  const hasMonthly = /\b(?:month|monthly)\b/.test(normalized);
  const hasAnnual = /\b(?:annual|annually|yearly|year)\b/.test(normalized);
  if (hasMonthly === hasAnnual) return undefined;
  if (/\b(?:prefer|choose|pick|select|use|want|like|rather|go with|do)\b/.test(normalized) ||
      /^(?:(?:the|option|target|amount)\s+)?(?:monthly|month|annual|annually|yearly|year)(?:\s+(?:one|option|amount|target|projection))?[.! ]*$/.test(normalized)) {
    return hasAnnual ? "annual" : "monthly";
  }
  return undefined;
}

export function getAllocationTargetChoiceFromConversation(conversationContext: readonly string[], afterIndex = -1): {
  horizon: "monthly" | "annual";
  evidence: string;
} | undefined {
  for (let index = conversationContext.length - 1; index > afterIndex; index -= 1) {
    if (findLatestAllocationTargetPrompt(conversationContext.slice(0, index + 1)) !== index) continue;
    const promptContext = conversationContext.slice(0, index + 1);
    for (let turnIndex = conversationContext.length - 1; turnIndex > index; turnIndex -= 1) {
      const turn = conversationContext[turnIndex];
      if (turn && !turn.startsWith("Victoria: ") && isCoveredAllocationTargetChoice(turn, promptContext)) {
        const horizon = allocationTargetChoice(turn);
        if (horizon) return { horizon, evidence: turn };
      }
    }
  }
  return undefined;
}

/** Recover a pending planning horizon from the unique event and the dialogue that followed it. */
export function recoverPendingPlanningHorizon(
  decision: AgentDecision,
  conversationContext: readonly string[]
): AgentDecision {
  if (!decision.planningChoice || decision.planningChoice.selectedHorizon) return decision;
  const summary = decision.savingsEvent?.summary;
  const eventIndex = summary && conversationContext.filter((turn) => turn === summary).length === 1
    ? conversationContext.lastIndexOf(summary) : -1;
  if (eventIndex < 0) return decision;
  const selected = getAllocationTargetChoiceFromConversation(conversationContext, eventIndex);
  if (!selected) return decision;
  return {
    ...decision,
    planningChoice: { ...decision.planningChoice, selectedHorizon: selected.horizon }
  };
}

function findLatestAllocationTargetPrompt(conversationContext: readonly string[]): number {
  for (let index = conversationContext.length - 1; index >= 0; index -= 1) {
    const turn = conversationContext[index];
    if (turn?.startsWith("Victoria: ") && /[?？]/.test(turn) &&
        /\b(?:month|monthly)\b/i.test(turn) && /\b(?:annual|annually|year|yearly)\b/i.test(turn) &&
        !/\b(?:would you like me to|can I|should I)\s+(?:record|log|save)\b/i.test(turn) &&
        /\b(?:which|choose|prefer|plan|planning|target|option|would you like|rather)\b/i.test(turn)) return index;
  }
  return -1;
}

export function resolveCoveredSpendPeriodAnswer(
  classification: ClassifiedMessage,
  message: string,
  conversationContext: readonly string[]
): ClassifiedMessage {
  const priorCoveredSpend = [...conversationContext].reverse()
    .map(freedRecurringSpend)
    .find((spend) => spend?.cadence === "month");
  const answersPeriodChoice = conversationContext.some((turn) =>
    turn.startsWith("Victoria: ") && /\b(?:month|monthly)\b/i.test(turn) &&
    /\b(?:annual|year|yearly)\b/i.test(turn) && /\b(?:choose|which|prefer|target|like)\b/i.test(turn)) &&
    /\b(?:annual|year|yearly|month|monthly)\b/i.test(message);
  const parsedAmount = parseExplicitDollarAmount(message);
  const namesKnownProjection = priorCoveredSpend !== undefined && parsedAmount.status === "valid" &&
    /\b(?:annual|year|yearly)\b/i.test(message) &&
    parsedAmount.amountCents === annualizeMonthlyAmountCents(priorCoveredSpend.amountCents);
  const coveredPeriodReference = isCoveredAllocationTargetChoice(message, conversationContext) ||
    ((priorCoveredSpend !== undefined || answersPeriodChoice) &&
    /\b(?:annual|year|yearly|month|monthly)\b/i.test(message) &&
    (parsedAmount.status !== "valid" || namesKnownProjection) &&
    !/\b(?:put|allocate|assign|link|apply|direct|contribute|set aside)\b/i.test(message));
  if (!coveredPeriodReference || classification.type === "real_money_movement_request") return classification;
  return {
    type: "general_finance",
    confidence: classification.confidence,
    summary: classification.summary,
    needsClarification: false
  };
}

export function isAnswerToRecentVictoriaQuestion(conversationContext: readonly string[]): boolean {
  const mostRecentMessage = conversationContext.at(-1);
  return mostRecentMessage?.startsWith("Victoria: ") === true && mostRecentMessage.includes("?");
}
