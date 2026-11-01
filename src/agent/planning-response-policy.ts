import { annualizeMonthlyAmountCents, formatUsd } from "../domain/money.js";
import { parseExplicitDollarAmount } from "../domain/financial-events/parse-explicit-amount.js";
import type { AgentDecision } from "./types.js";
import { freedRecurringSpend } from "./money-movement-intent.js";

export function answerRecurringProjectionQuestion(
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

export function describeAnnualProjection(projection: {
  monthlyAmountCents: number;
  annualAmountCents: number;
  eventCount: number;
}): string {
  const subject = projection.eventCount === 2 ? "Together, those two stated costs" : "That stated cost";
  return `${subject} would be ${formatUsd(projection.monthlyAmountCents)} a month, or ${formatUsd(projection.annualAmountCents)} over 12 months if the costs stay out of your budget. This is a planning projection, not an amount already saved.`;
}

export function describeCombinedProjectionAndClarifyRecordTarget(
  projection: { monthlyAmountCents: number; annualAmountCents: number; eventCount: number },
  costs?: readonly { monthlyAmountCents: number }[],
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

export function answerBufferQuestion(message: string, amountCents: number | undefined): string | undefined {
  if (amountCents === undefined || !/\b(?:buffer|cushion|emergency fund)\b/i.test(message) ||
      !/\b(?:whether|should|make sense|sensible|good idea|recommend)\b/i.test(message)) return;
  return `Keeping the ${formatUsd(amountCents)} as a buffer could make sense if it helps cover upcoming needs and you can leave it out of day-to-day spending. That is a planning choice; nothing has been recorded.`;
}

export function isCurrentMonthRecordRequest(message: string): boolean {
  return /\b(?:record|log|save|add)\b/i.test(message) &&
    /\b(?:this|current)\s+month\b/i.test(message);
}

export function getPriorCoveredSpendProjection(conversationContext: readonly string[]): {
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

export function isValidRestoredPlanningChoice(decision: AgentDecision): boolean {
  const choice = decision.planningChoice;
  if (!choice) return true;
  return Number.isSafeInteger(choice.monthlyAmountCents) && choice.monthlyAmountCents > 0 &&
    Number.isSafeInteger(choice.monthlyAmountCents * 12) &&
    Number.isSafeInteger(choice.annualProjectionCents) &&
    choice.annualProjectionCents === choice.monthlyAmountCents * 12 &&
    choice.monthlyAmountCents === decision.proposal?.suggestion.amountCents &&
    (choice.selectedHorizon === undefined || choice.selectedHorizon === "monthly" || choice.selectedHorizon === "annual");
}
