import { isNeverStoreMemoryEvidence } from "./conversational-memory-extractor.js";

export type MemoryLearningIntent =
  | "avoided_spend"
  | "regretful_spend"
  | "pattern_reflection"
  | "general_finance"
  | "savings_progress"
  | "unclear";

/** Decide whether optional stable-fact extraction may inspect a read-only turn. */
export function isMemoryLearningEligibleTurn(input: {
  readonly message: string;
  readonly intent: string;
  readonly uncertainIntent?: string;
}): boolean {
  if (!input.message.trim() || input.uncertainIntent !== undefined ||
      !["avoided_spend", "regretful_spend", "pattern_reflection", "general_finance", "savings_progress", "unclear"]
        .includes(input.intent) || isNeverStoreMemoryEvidence(input.message)) return false;

  // Memory lifecycle requests must be handled by explicit correction/forget flows,
  // never interpreted as new stable facts by the optional extractor.
  return !/\b(?:forget|stop remembering|don't remember|do not remember|erase my|delete my|remove my)\b/i.test(input.message) &&
    !/\b(?:maybe|might|possibly|not sure|unsure|guess(?:ing)?|considering|thinking about)\b/i.test(input.message) &&
    !/\b(?:correct|change|update)\s+(?:what\s+you\s+)?(?:remember|remembered|memory|my preference|my goal|my habit)\b/i.test(input.message);
}
