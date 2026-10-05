import { formatUsd } from "../domain/money.js";
import type { FinancialMomentFinding, SavingsAssessment } from "./team-prototype.js";

/** Locked instructions for the voice specialist; the response guard enforces them afterward. */
export function requiredDisclosures(finding: FinancialMomentFinding, assessment: SavingsAssessment): readonly string[] {
  if (assessment.outcome === "suggest") {
    return Object.freeze(["Ask for explicit confirmation before recording.", "No real money has moved."]);
  }
  if (finding.classification.type === "real_money_movement_request") {
    return Object.freeze(["Victoria cannot move real money in the MVP.", "No transfer has been made."]);
  }
  return Object.freeze([]);
}

export interface FinalizedResponse {
  message: string;
  voiceDraftAccepted: boolean;
}

/** Deterministic post-processing that protects facts and required disclosures. */
export function finalizeCompanionResponse(
  draft: unknown,
  finding: FinancialMomentFinding,
  assessment: SavingsAssessment
): FinalizedResponse {
  const voiceDraftAccepted = isSafeVoiceDraft(draft, finding, assessment);
  let message = voiceDraftAccepted ? draft.trim() : deterministicResponse(finding, assessment);
  message = enforceRequiredDisclosures(message, finding, assessment);
  return Object.freeze({ message, voiceDraftAccepted });
}

function enforceRequiredDisclosures(message: string, finding: FinancialMomentFinding, assessment: SavingsAssessment): string {
  if (claimsCompletedAction(message)) message = deterministicResponse(finding, assessment);

  if (assessment.outcome === "suggest") {
    const amount = formatUsd(assessment.amountCents);
    const asksConfirmation = /\?/.test(message) && /\b(?:record|save|ledger)\b/i.test(message) && message.includes(amount);
    const invitation = asksConfirmation ? "" : assessment.source === "habit_estimate"
      ? ` Would you like me to record an estimated ${amount} in your Victoria savings ledger?`
      : ` Would you like me to record ${amount} in your Victoria savings ledger?`;
    const estimateDisclosure = assessment.source === "habit_estimate" && !/\b(?:estimate|estimated|about|around|approximately)\b/i.test(message)
      ? " This amount is an estimate based on the spending information available."
      : "";
    const confirmation = /\bconfirm\b/i.test(message) ? "" : " Please confirm before I record it.";
    const disclosure = /no real money has moved/i.test(message) ? "" : " No real money has moved.";
    return `${message}${estimateDisclosure}${invitation}${confirmation}${disclosure}`.trim();
  }
  if (finding.classification.type === "real_money_movement_request") {
    const limitations = /cannot move real money/i.test(message) ? "" : " I can't move real money in the Victoria MVP.";
    const noTransfer = /no transfer has been made/i.test(message) ? "" : " No transfer has been made.";
    return `${message}${limitations}${noTransfer}`.trim();
  }
  return message;
}

function isSafeVoiceDraft(candidate: unknown, finding: FinancialMomentFinding, assessment: SavingsAssessment): candidate is string {
  if (typeof candidate !== "string" || !candidate.trim() || claimsCompletedAction(candidate) || isShaming(candidate)) return false;
  if (assessment.outcome === "ask" && !candidate.includes("?")) return false;
  if (hasUnsupportedMoneyAmount(candidate, finding, assessment)) return false;
  return true;
}

function isShaming(message: string): boolean {
  return /\b(?:irresponsible|lazy|bad with money|you should have known|shame on you|you failed)\b/i.test(message);
}

function hasUnsupportedMoneyAmount(message: string, finding: FinancialMomentFinding, assessment: SavingsAssessment): boolean {
  const mentions = message.match(/(?:[$€£]\s?-?\d[\d,]*(?:\.\d+)?|\b-?\d[\d,]*(?:\.\d+)?\s+(?:dollars?|bucks)\b)/gi) ?? [];
  if (!mentions.length) return false;
  const expectedAmount = assessment.outcome === "suggest"
    ? assessment.amountCents
    : finding.classification.amountCents;
  if (!Number.isSafeInteger(expectedAmount) || (expectedAmount ?? 0) <= 0) return true;
  return mentions.some((mention) => {
    if (/[€£]/.test(mention)) return true;
    const normalized = mention.replace(/[$,\s]|\b(?:dollars?|bucks)\b/gi, "");
    const parsedCents = Math.round(Number(normalized) * 100);
    return !Number.isSafeInteger(parsedCents) || parsedCents !== expectedAmount;
  });
}

function claimsCompletedAction(message: string): boolean {
  const withoutSafeNegation = message.replace(/\bno real money has moved\b/gi, "");
  return /\b(?:i|we|you|it)\s+(?:have\s+)?(?:transferred|moved|saved|recorded|deposited)\b|\b(?:has been|was)\s+(?:recorded|saved|transferred|moved|deposited)\b|\b(?:money|funds)\s+(?:has|have)\s+moved\b/i.test(withoutSafeNegation);
}

function deterministicResponse(finding: FinancialMomentFinding, assessment: SavingsAssessment): string {
  if (assessment.outcome === "suggest") {
    return `Would you like me to record ${formatUsd(assessment.amountCents)} in your Victoria savings ledger? Please confirm before I record it. No real money has moved.`;
  }
  if (assessment.outcome === "ask") return assessment.question;
  if (finding.classification.type === "real_money_movement_request") {
    return "I can't move real money in the Victoria MVP. No transfer has been made.";
  }
  return "No shame. We can reflect on what happened and consider a practical next step.";
}
