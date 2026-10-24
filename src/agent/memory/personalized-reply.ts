import type { ConversationalMemory } from "./types.js";

export interface PersonalizedReplyInput {
  readonly userMessage: string;
  readonly baselineReply: string;
  readonly memories: readonly Pick<ConversationalMemory, "id" | "category" | "key" | "value">[];
  readonly conversationContext?: readonly string[];
  readonly validatedMonthlyAmountCents?: number;
  readonly validatedAnnualProjectionCents?: number;
  readonly revisionFeedback?: string;
}

export interface ConversationalReplyPersonalizer {
  personalize(input: PersonalizedReplyInput): Promise<unknown>;
}

export interface ValidatedPersonalizedReply {
  readonly message: string;
  readonly usedMemoryIds: readonly string[];
}

/** A provider may change the wording, but it must name the memories grounding that change. */
export function validatePersonalizedReply(
  candidate: unknown,
  input: PersonalizedReplyInput
): ValidatedPersonalizedReply | null {
  if (!candidate || typeof candidate !== "object" || Array.isArray(candidate)) return null;
  const result = candidate as { message?: unknown; usedMemoryIds?: unknown };
  if (typeof result.message !== "string" || !result.message.trim() || result.message.trim().length > 1500 ||
      !Array.isArray(result.usedMemoryIds) || result.usedMemoryIds.length > 3 ||
      !result.usedMemoryIds.every((id) => typeof id === "string")) return null;
  const available = new Map(input.memories.map((memory) => [memory.id, memory]));
  const usedIds = [...new Set(result.usedMemoryIds as string[])];
  if (usedIds.length !== result.usedMemoryIds.length || usedIds.some((id) => !available.has(id))) return null;

  const message = result.message.trim();
  const annualProjectionCents = input.validatedAnnualProjectionCents;
  const projectionMentioned = annualProjectionCents === undefined ||
    !/\b(?:annual|year|yearly|annually)\b/i.test(input.userMessage) ||
    (message.match(/(?:\$\s?-?\d[\d,]*(?:\.\d+)?|\b-?\d[\d,]*(?:\.\d+)?\s+(?:dollars?|bucks)\b)/gi) ?? [])
      .some((amount) => containsEquivalentCents(annualProjectionCents, amount));
  if ((input.baselineReply.includes("?") && !message.includes("?")) || isShaming(message) ||
      claimsActionCompleted(message) || claimsMoneyMoved(message) || !projectionMentioned ||
      offersAnnualProjectionForRecording(message, input) || offersLedgerRecording(message) ||
      offersSpecificInvestmentAdvice(message) || /(?:^|\s)1[).]\s+.*(?:^|\s)2[).]\s+/s.test(message) ||
      hasUnsupportedAmount(message, input, usedIds.map((id) => available.get(id)!))) return null;
  return Object.freeze({ message, usedMemoryIds: Object.freeze(usedIds) });
}

function offersLedgerRecording(message: string): boolean {
  return message.split("?").some((clause) =>
    /\b(?:would you like|do you want|want me to|should I|can I|may I|shall I)\b/i.test(clause) &&
    /\b(?:record|log|add|save)\b/i.test(clause) &&
    /\b(?:ledger|savings|entry|amount)\b/i.test(clause));
}

function offersSpecificInvestmentAdvice(message: string): boolean {
  return /\b(?:invest(?:ing)?\s+(?:it|this|that|the\s+money)|index fund|etf|stocks?|bonds?|crypto|tfsa|ira|401\s?\(?k\)?)\b/i.test(message);
}

function offersAnnualProjectionForRecording(message: string, input: PersonalizedReplyInput): boolean {
  const annualCents = input.validatedAnnualProjectionCents;
  const monthlyCents = input.validatedMonthlyAmountCents;
  if (!Number.isSafeInteger(annualCents) || !Number.isSafeInteger(monthlyCents) || annualCents === monthlyCents) return false;
  const clauses = message.split(/[.!?;\n]+/);
  return clauses.some((clause) => {
    if (!/\b(?:record|save|log|enter|add|deposit|transfer)\b/i.test(clause) ||
        !/\b(?:ledger|account|bank|transfer|deposit)\b/i.test(clause)) return false;
    if (/\b(?:annual|yearly|annually|per year)\b/i.test(clause)) return true;
    const amounts = clause.match(/(?:\$\s?-?\d[\d,]*(?:\.\d+)?|\b-?\d[\d,]*(?:\.\d+)?\s+(?:dollars?|bucks)\b)/gi) ?? [];
    return amounts.some((amount) => containsEquivalentCents(annualCents, amount));
  });
}

function hasUnsupportedAmount(
  message: string,
  input: PersonalizedReplyInput,
  usedMemories: readonly Pick<ConversationalMemory, "value">[]
): boolean {
  const values = [input.baselineReply, ...(input.conversationContext ?? []), ...usedMemories.map((memory) => memory.value)];
  const amounts = message.match(/(?:-?[$€£]\s?-?\d[\d,]*(?:\.\d+)?|(?<![\w])-?\d[\d,]*(?:\.\d+)?\s+(?:dollars?|bucks)\b)/gi) ?? [];
  if (amounts.some((amount) => parsePositiveUsdCents(amount) === null)) return true;
  return amounts.some((amount) =>
    !values.some((value) => containsEquivalentAmount(value, amount)) &&
    !containsEquivalentCents(input.validatedMonthlyAmountCents, amount) &&
    !containsEquivalentCents(input.validatedAnnualProjectionCents, amount));
}

function containsEquivalentCents(expectedCents: number | undefined, amount: string): boolean {
  return parsePositiveUsdCents(amount) === expectedCents;
}

function containsEquivalentAmount(text: string, amount: string): boolean {
  const cents = parsePositiveUsdCents(amount);
  if (cents === null) return false;
  const sourceAmounts = text.match(/(?:-?\$\s?-?\d[\d,]*(?:\.\d+)?|\b-?\d[\d,]*(?:\.\d+)?\s+(?:dollars?|bucks)\b)/gi) ?? [];
  return sourceAmounts.some((source) => parsePositiveUsdCents(source) === cents);
}

function parsePositiveUsdCents(amount: string): number | null {
  if (/[€£-]/.test(amount)) return null;
  const normalized = amount.replace(/[$\s]|\b(?:dollars?|bucks)\b/gi, "");
  if (!/^(?:\d+|\d{1,3}(?:,\d{3})+)(?:\.\d{1,2})?$/.test(normalized)) return null;
  const cents = Math.round(Number(normalized.replace(/,/g, "")) * 100);
  return Number.isSafeInteger(cents) && cents > 0 ? cents : null;
}

function claimsActionCompleted(message: string): boolean {
  return /\b(?:i|we|you|victoria)\s+(?:have\s+)?(?:recorded|transferred|moved|deposited)\b|\b(?:i|we|you|victoria)\s+(?:have\s+)?saved\s+(?:(?:the|some)\s+)?(?:money|funds|savings|amount)\b|\b(?:money|funds)\s+(?:has|have)\s+moved\b/i.test(message);
}

function claimsMoneyMoved(message: string): boolean {
  return /\b(?:i|we|you|victoria)\s+(?:(?:can|will|would|have|has|already|just)\s+)*(?:move|moves|moved|transfer|transfers|transferred|send|sends|sent|deposit|deposits|deposited)\b/i.test(message) &&
    !/\b(?:can't|cannot|won't|wouldn't|don't|do not|didn't|did not|haven't|have not|hasn't|has not)\b/i.test(message);
}

function isShaming(message: string): boolean {
  return /\b(?:irresponsible|lazy|bad with money|you should have known|shame on you|you failed)\b/i.test(message);
}
