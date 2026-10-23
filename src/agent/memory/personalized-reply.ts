import type { ConversationalMemory } from "./types.js";

export interface PersonalizedReplyInput {
  readonly userMessage: string;
  readonly baselineReply: string;
  readonly memories: readonly Pick<ConversationalMemory, "id" | "category" | "key" | "value">[];
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
  if (typeof result.message !== "string" || !result.message.trim() || result.message.trim().length > 900 ||
      !Array.isArray(result.usedMemoryIds) || result.usedMemoryIds.length < 1 || result.usedMemoryIds.length > 3 ||
      !result.usedMemoryIds.every((id) => typeof id === "string")) return null;
  const available = new Map(input.memories.map((memory) => [memory.id, memory]));
  const usedIds = [...new Set(result.usedMemoryIds as string[])];
  if (usedIds.length !== result.usedMemoryIds.length || usedIds.some((id) => !available.has(id))) return null;

  const message = result.message.trim();
  if ((input.baselineReply.includes("?") && !message.includes("?")) || isShaming(message) ||
      claimsActionCompleted(message) || claimsMoneyMoved(message) ||
      hasUnsupportedAmount(message, input, usedIds.map((id) => available.get(id)!))) return null;
  return Object.freeze({ message, usedMemoryIds: Object.freeze(usedIds) });
}

function hasUnsupportedAmount(
  message: string,
  input: PersonalizedReplyInput,
  usedMemories: readonly Pick<ConversationalMemory, "value">[]
): boolean {
  const values = [input.baselineReply, ...usedMemories.map((memory) => memory.value)];
  const amounts = message.match(/(?:[$€£]\s?-?\d[\d,]*(?:\.\d+)?|\b-?\d[\d,]*(?:\.\d+)?\s+(?:dollars?|bucks)\b)/gi) ?? [];
  return amounts.some((amount) => !values.some((value) => containsEquivalentAmount(value, amount)));
}

function containsEquivalentAmount(text: string, amount: string): boolean {
  if (/[€£]/.test(amount)) return false;
  const normalized = amount.replace(/[$,\s]|\b(?:dollars?|bucks)\b/gi, "");
  const cents = Math.round(Number(normalized) * 100);
  if (!Number.isSafeInteger(cents)) return false;
  const sourceAmounts = text.match(/(?:\$\s?-?\d[\d,]*(?:\.\d+)?|\b-?\d[\d,]*(?:\.\d+)?\s+(?:dollars?|bucks)\b)/gi) ?? [];
  return sourceAmounts.some((source) => Math.round(Number(source.replace(/[$,\s]|\b(?:dollars?|bucks)\b/gi, "")) * 100) === cents);
}

function claimsActionCompleted(message: string): boolean {
  return /\b(?:i|we|you|victoria)\s+(?:have\s+)?(?:recorded|transferred|moved|deposited|saved)\b|\b(?:money|funds)\s+(?:has|have)\s+moved\b/i.test(message);
}

function claimsMoneyMoved(message: string): boolean {
  return /\b(?:i|we|you|victoria)\s+(?:(?:can|will|would|have|has|already|just)\s+)*(?:move|moves|moved|transfer|transfers|transferred|send|sends|sent|deposit|deposits|deposited)\b/i.test(message) &&
    !/\b(?:can't|cannot|won't|wouldn't|don't|do not|didn't|did not|haven't|have not|hasn't|has not)\b/i.test(message);
}

function isShaming(message: string): boolean {
  return /\b(?:irresponsible|lazy|bad with money|you should have known|shame on you|you failed)\b/i.test(message);
}
