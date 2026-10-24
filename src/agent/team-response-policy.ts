import { formatUsd } from "../domain/money.js";
import type { FinancialMomentFinding, SavingsAssessment } from "./team-prototype.js";

const noMovementDisclosurePattern = /\bno\s+(?:real\s+)?(?:money|funds)\s+(?:(?:has|have|was|were)\s+)?(?:been\s+)?(?:moved|transferred|sent|deposited)(?:\s+yet)?\b/gi;

/** Locked instructions for the voice specialist; the response guard enforces them afterward. */
export function requiredDisclosures(finding: FinancialMomentFinding, assessment: SavingsAssessment): readonly string[] {
  if (assessment.outcome === "suggest") {
    if (finding.responseContext?.awaitingAllocationTargetChoice) {
      return Object.freeze(["Ask which allocation target the user prefers before asking for ledger confirmation.", "No real money has moved."]);
    }
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
  validationIssues: readonly VoiceDraftIssue[];
}

export type VoiceDraftIssue =
  | "empty_draft"
  | "claims_completed_action"
  | "claims_real_money_capability"
  | "shaming_language"
  | "unsupported_assurance"
  | "unsupported_amount"
  | "missing_question"
  | "missing_confirmation_request"
  | "missing_remembered_interest"
  | "missing_validated_projection";

export function voiceDraftRevisionFeedback(issues: readonly VoiceDraftIssue[]): string {
  const guidance: Record<VoiceDraftIssue, string> = {
    empty_draft: "Write a complete reply to the user.",
    claims_completed_action: "Do not say that a recording or other action has already happened.",
    claims_real_money_capability: "Do not claim Victoria can execute a real transfer; discuss the user's own budgeting choices freely.",
    shaming_language: "Use compassionate, nonjudgmental language.",
    unsupported_assurance: "Remove guarantees or claims about balances that were not supplied.",
    unsupported_amount: "Use only the supplied, validated amounts and label projections as conditional.",
    missing_question: "Ask a clear, relevant question.",
    missing_confirmation_request: "Include an explicit, natural confirmation request for recording only the current suggested amount in the Victoria savings ledger.",
    missing_remembered_interest: "Naturally acknowledge at least one supplied remembered interest; do not mechanically repeat its stored wording.",
    missing_validated_projection: "Include the supplied annual projection and say it depends on the coverage continuing; do not present it as already saved or transferable."
  };
  return `Revise the reply to fix these review findings: ${[...new Set(issues)].map((issue) => guidance[issue]).join(" ")} Keep the user's emotional and practical context, answer their actual question, and retain a warm, conversational voice. Do not quote this feedback.`;
}

/** Deterministic post-processing that protects facts and required disclosures. */
export function finalizeCompanionResponse(
  draft: unknown,
  finding: FinancialMomentFinding,
  assessment: SavingsAssessment
): FinalizedResponse {
  const normalizedDraft = typeof draft === "string" && assessment.outcome === "suggest" &&
    !finding.responseContext?.awaitingAllocationTargetChoice
    ? normalizeLedgerConfirmation(draft, assessment.amountCents)
    : draft;
  const validationIssues = inspectVoiceDraft(normalizedDraft, finding, assessment);
  // A missing ledger-confirmation question is recoverable: preserve the
  // generated reply and append the explicit, approval-gated ledger question.
  // Discarding an otherwise safe conversation for that omission caused the
  // exact generic fallback users reported.
  const blockingIssues = validationIssues.filter((issue) => issue !== "missing_confirmation_request");
  const voiceDraftAccepted = typeof normalizedDraft === "string" && normalizedDraft.trim().length > 0 && blockingIssues.length === 0;
  let message = voiceDraftAccepted && typeof normalizedDraft === "string" ? normalizedDraft.trim() : deterministicResponse(finding, assessment);
  message = enforceRequiredDisclosures(message, finding, assessment);
  return Object.freeze({ message, voiceDraftAccepted, validationIssues });
}

/** Preserve a generated confirmation question while grounding its destination in Victoria's ledger. */
function normalizeLedgerConfirmation(message: string, amountCents: number): string {
  if (containsExplicitLedgerConfirmation(message, amountCents)) return message;
  const confirmationSignals = /\b(?:would you like|do you want|want me to|should I|can I|may I|shall I|please confirm|would you feel comfortable|are you comfortable|is it okay if I|is that okay with you)\b/i;
  const recordingAction = /\b(?:record|save|log|enter|add)\b/i;
  const questions = [...message.matchAll(/[^?]*\?/g)];
  for (const match of questions) {
    const question = match[0];
    if (!confirmationSignals.test(question) || !recordingAction.test(question) || !messageMentionsAmount(question, amountCents)) continue;
    const trackerOrDestination = /\s+(?:in|to)\s+(?:a|an|the|your|my)\s+(?:[A-Za-z'-]+\s+){0,5}(?:ledger|tracker|fund|goal|account)\s*\?$/i;
    if (trackerOrDestination.test(question)) {
      return message.replace(question, question.replace(trackerOrDestination, " in your Victoria savings ledger?"));
    }
    return message.replace(question, `${question.slice(0, -1).trimEnd()} in your Victoria savings ledger?`);
  }
  return message;
}

function enforceRequiredDisclosures(message: string, finding: FinancialMomentFinding, assessment: SavingsAssessment): string {
  if (claimsCompletedAction(message)) message = deterministicResponse(finding, assessment);

  if (assessment.outcome === "suggest") {
    const amount = formatUsd(assessment.amountCents);
    const asksConfirmation = containsExplicitLedgerConfirmation(message, assessment.amountCents);
    const invitation = finding.responseContext?.awaitingAllocationTargetChoice || asksConfirmation ? "" : assessment.source === "habit_estimate"
      ? ` Would you like me to record an estimated ${amount} in your Victoria savings ledger?`
      : ` Would you like me to record ${amount} in your Victoria savings ledger?`;
    const estimateDisclosure = assessment.source === "habit_estimate" && !/\b(?:estimate|estimated|about|around|approximately)\b/i.test(message)
      ? "This amount is an estimate based on the spending information available."
      : undefined;
    const disclosure = hasNoMovementDisclosure(message) ? undefined : "No real money has moved.";
    return appendSentences(message, [estimateDisclosure, invitation.trim() || undefined, disclosure]);
  }
  if (finding.classification.type === "real_money_movement_request") {
    const limitations = /cannot move real money/i.test(message) ? "" : " I can't move real money in the Victoria MVP.";
    const noTransfer = /no transfer has been made/i.test(message) ? "" : " No transfer has been made.";
    return `${message}${limitations}${noTransfer}`.trim();
  }
  return message;
}

function appendSentences(message: string, additions: readonly (string | undefined)[]): string {
  let result = message.trim();
  for (const addition of additions) {
    if (!addition) continue;
    if (result && !/[.!?…]["')\]]?$/.test(result)) result += ".";
    result = result ? `${result} ${addition}` : addition;
  }
  return result;
}

function messageMentionsAmount(message: string, expectedAmountCents: number): boolean {
  const mentions = message.match(/(?:-?[$€£]\s?-?\d[\d,]*(?:\.\d+)?|(?<![\w])-?\d[\d,]*(?:\.\d+)?\s+(?:dollars?|bucks)\b)/gi) ?? [];
  return mentions.some((mention) => parsePositiveVoiceUsdCents(mention) === expectedAmountCents);
}

function parsePositiveVoiceUsdCents(amount: string): number | null {
  if (/[€£-]/.test(amount)) return null;
  const normalized = amount.replace(/[$\s]|\b(?:dollars?|bucks)\b/gi, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized.replaceAll(",", "")) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function containsExplicitLedgerConfirmation(message: string, amountCents: number): boolean {
  const normalized = message.replace(/[’‘]/g, "'");
  if (!/\bVictoria(?:'s)?\b.{0,40}\b(?:mocked\s+)?savings ledger\b/i.test(normalized)) return false;
  const confirmationSignals = /\b(?:would you like|do you want|want me to|should I|can I|may I|shall I|please confirm|would you feel comfortable|are you comfortable|is it okay if I|is that okay with you)\b/i;
  const recordingAction = /\b(?:record|save|log|enter|add)\b/i;
  return normalized.split("?").some((question) => confirmationSignals.test(question) &&
    recordingAction.test(question) && messageMentionsAmount(question, amountCents));
}

function inspectVoiceDraft(
  candidate: unknown,
  finding: FinancialMomentFinding,
  assessment: SavingsAssessment
): VoiceDraftIssue[] {
  if (typeof candidate !== "string" || !candidate.trim()) return ["empty_draft"];
  const issues: VoiceDraftIssue[] = [];
  if (claimsCompletedAction(candidate)) issues.push("claims_completed_action");
  if (claimsProhibitedMoneyMovement(candidate)) issues.push("claims_real_money_capability");
  if (isShaming(candidate)) issues.push("shaming_language");
  if (claimsUnsupportedAssurance(candidate)) issues.push("unsupported_assurance");
  if (hasUnsupportedMoneyAmount(candidate, finding, assessment)) issues.push("unsupported_amount");
  if (assessment.outcome === "ask" && !candidate.includes("?")) issues.push("missing_question");
  if (assessment.outcome === "suggest" && finding.responseContext?.awaitingAllocationTargetChoice &&
      (!candidate.includes("?") || !/\bmonth(?:ly)?\b/i.test(candidate) || !/\b(?:annual|annually|year|yearly)\b/i.test(candidate))) {
    issues.push("missing_question");
  }
  if (assessment.outcome === "suggest" && !finding.responseContext?.awaitingAllocationTargetChoice) {
    if (!containsExplicitLedgerConfirmation(candidate, assessment.amountCents)) issues.push("missing_confirmation_request");
  }
  if (assessment.outcome === "suggest" && finding.responseContext?.rememberedInterests?.length) {
    const responseWords = new Set(candidate.toLocaleLowerCase().match(/[a-z0-9]+/g) ?? []);
    const interestMentioned = finding.responseContext.rememberedInterests.some((interest) => {
      const contentWords = (interest.toLocaleLowerCase().match(/[a-z0-9]+/g) ?? [])
        .filter((word) => word.length >= 4 && !/^(?:enjoy|enjoys|enjoying|playing|play|likes|like|loving|love|about|that|with|your|their|interest|interests)$/.test(word));
      return contentWords.some((word) => responseWords.has(word));
    });
    if (!interestMentioned) issues.push("missing_remembered_interest");
  }
  if (assessment.outcome === "suggest" && finding.responseContext?.validatedAdditionalAmountsCents?.length) {
    if (finding.responseContext.validatedAdditionalAmountsCents.some((amount) => !messageMentionsAmount(candidate, amount))) {
      issues.push("missing_validated_projection");
    }
  }
  return issues;
}

function claimsProhibitedMoneyMovement(message: string): boolean {
  if (/\bno\s+(?:real\s+)?(?:money|funds)\s+(?:has|have|was|were)\s+not\s+(?:been\s+)?(?:moved|transferred|sent|deposited)\b/i.test(message)) {
    return true;
  }
  const safeNegations = [
    /\bno\s+(?:real\s+)?(?:money|funds)\s+(?:(?:has|have|was|were)\s+)?(?:been\s+)?(?:moved|transferred|sent|deposited)(?:\s+yet)?\b/gi,
    /\b(?:money|funds)\s+(?:(?:has|have|was|were)\s+)?not\s+(?:been\s+)?(?:moved|transferred|sent|deposited)(?:\s+yet)?\b/gi,
    /\b(?:i|we|you|victoria)\s+(?:did\s+not|didn't|have\s+not|haven't|has\s+not|hasn't|never)\s+(?:move|moves|moved|moving|transfer|transfers|transferred|transferring|send|sends|sent|sending|deposit|deposits|deposited|depositing)\b/gi
  ];
  const withoutSafeNegations = safeNegations.reduce((text, pattern) => text.replace(pattern, ""), message);
  const action = "(?:(?:set\\s+up|schedule|initiate|execute|process|submit)\\s+(?:a\\s+)?(?:money\\s+)?transfer|move|moves|moved|moving|transfer|transfers|transferred|transferring|send|sends|sent|sending|deposit|deposits|deposited|depositing)";
  // A user-directed budgeting suggestion ("you could move some into savings")
  // is not a claim that Victoria can execute a transfer. Guard Victoria's own
  // claimed capability/action and completed passive claims instead.
  const affirmativeActorClaim = new RegExp(`\\b(?:i|we|victoria)\\s+(?:(?:can|will|would|could|have|has|already|just|help(?:\\s+you)?)\\s+)*(?:${action})\\b`, "i");
  const attributedUserClaim = new RegExp(`\\byou\\s+(?:can|could|will|would|may)\\s+(?:(?:ask|have)\\s+(?:me|victoria)\\s+to\\s+)?(?:${action})\\b.{0,55}\\b(?:with|through|via|using)\\s+victoria(?:['’]s)?(?:\\s+app)?\\b`, "i");
  const delegatedUserClaim = new RegExp(`\\byou\\s+(?:can|could|will|would|may)\\s+(?:ask\\s+(?:me|victoria)\\s+to|have\\s+(?:me|victoria))\\s+(?:${action})\\b`, "i");
  const completedPassiveClaim = /\b(?:money|funds|a transfer)\s+(?:was|were|has been|have been)\s+(?:(?:moved|transferred|sent|deposited|made|completed|scheduled|initiated|executed|processed|submitted)|set\s+up)\b/i;
  return affirmativeActorClaim.test(withoutSafeNegations) || attributedUserClaim.test(withoutSafeNegations) ||
    delegatedUserClaim.test(withoutSafeNegations) || completedPassiveClaim.test(withoutSafeNegations);
}

function claimsUnsupportedAssurance(message: string): boolean {
  const withoutExplicitNegation = message
    .replace(/\b(?:not|never|no longer|isn't|aren't|wasn't|weren't|can't be)\s+(?:be\s+)?guaranteed\b/gi, "")
    .replace(/\bno\s+guarantees?\b/gi, "")
    .replace(/\bnot\s+(?:a\s+)?guarantee\b/gi, "");
  return /\b(?:guarantee(?:s|d)?|ensure|assure)\b|\b(?:protected|available) balance\b/i.test(withoutExplicitNegation);
}

function hasNoMovementDisclosure(message: string): boolean {
  return stripNoMovementDisclosures(message) !== message ||
    /\bno\s+(?:real\s+)?money\s+(?:will\s+be|is\s+going\s+to\s+be)\s+(?:moved|transferred|sent|deposited)\b/i.test(message) ||
    /\b(?:won't|will not|doesn't|does not)\s+move\s+(?:any\s+)?real money\b/i.test(message) ||
    /\b(?:ledger entry|recording|mock ledger)\b.{0,50}\b(?:doesn't|does not|won't|will not)\s+(?:move|transfer)\b.{0,30}\breal money\b/i.test(message);
}

function isShaming(message: string): boolean {
  return /\b(?:irresponsible|lazy|bad with money|you should have known|shame on you|you failed)\b/i.test(message);
}

function hasUnsupportedMoneyAmount(message: string, finding: FinancialMomentFinding, assessment: SavingsAssessment): boolean {
  const mentions = message.match(/(?:-?[$€£]\s?-?\d[\d,]*(?:\.\d+)?|(?<![\w])-?\d[\d,]*(?:\.\d+)?\s+(?:dollars?|bucks)\b)/gi) ?? [];
  if (!mentions.length) return false;
  const expectedAmount = assessment.outcome === "suggest"
    ? assessment.amountCents
    : finding.classification.amountCents;
  const allowedAmounts = [expectedAmount, ...(finding.responseContext?.validatedAdditionalAmountsCents ?? [])]
    .filter((amount): amount is number => typeof amount === "number" && Number.isSafeInteger(amount) && amount > 0);
  if (!allowedAmounts.length) return true;
  return mentions.some((mention) => {
    const parsedCents = parsePositiveVoiceUsdCents(mention);
    return parsedCents === null || !allowedAmounts.includes(parsedCents);
  });
}

function claimsCompletedAction(message: string): boolean {
  const withoutSafeNegation = stripNoMovementDisclosures(message);
  return /\b(?:i|we|you|it)\s+(?:have\s+)?(?:transferred|moved|saved|recorded|deposited)\b|\b(?:has been|was)\s+(?:recorded|saved|transferred|moved|deposited)\b|\b(?:money|funds)\s+(?:has|have)\s+moved\b/i.test(withoutSafeNegation);
}

function stripNoMovementDisclosures(message: string): string {
  return message.replace(noMovementDisclosurePattern, "");
}

function deterministicResponse(finding: FinancialMomentFinding, assessment: SavingsAssessment): string {
  if (assessment.outcome === "suggest") {
    if (finding.responseContext?.awaitingAllocationTargetChoice) {
      const annualCents = finding.responseContext.validatedAdditionalAmountsCents?.[0];
      if (annualCents !== undefined && Number.isSafeInteger(annualCents) && annualCents > 0) {
        return `With the expense covered, you have ${formatUsd(assessment.amountCents)} for this month, or ${formatUsd(annualCents)} over a year if coverage continues. Which planning target would you prefer, monthly or annual? No real money has moved.`;
      }
    }
    return `Would you like me to record ${formatUsd(assessment.amountCents)} in your Victoria savings ledger? Please confirm before I record it. No real money has moved.`;
  }
  if (assessment.outcome === "ask") return assessment.question;
  if (finding.classification.type === "real_money_movement_request") {
    return "I can't move real money in the Victoria MVP. No transfer has been made.";
  }
  return "No shame. We can reflect on what happened and consider a practical next step.";
}
