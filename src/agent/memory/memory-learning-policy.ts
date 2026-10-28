import { isNeverStoreMemoryEvidence } from "./conversational-memory-extractor.js";

const ACTION_INTENTS = new Set([
  "goal_allocation", "proposal_revision", "entry_correction", "real_money_movement_request"
]);

/** Decide whether optional stable-fact extraction may inspect a turn independently of read-only intent labels. */
export function isMemoryLearningEligibleTurn(input: {
  readonly message: string;
  readonly intent: string;
  readonly uncertainIntent?: string;
}): boolean {
  if (!input.message.trim() || input.uncertainIntent !== undefined || ACTION_INTENTS.has(input.intent) ||
      isNeverStoreMemoryEvidence(input.message)) return false;

  // Memory lifecycle requests must be handled by explicit correction/forget flows,
  // never interpreted as new stable facts by the optional extractor.
  return !/\b(?:forget|stop remembering|don't remember|do not remember|erase my|delete my|remove my)\b/i.test(input.message) &&
    !/\b(?:maybe|might|possibly|not sure|unsure|guess(?:ing)?|considering|thinking about)\b/i.test(input.message) &&
    !/\b(?:correct|change|update)\s+(?:what\s+you\s+)?(?:remember|remembered|memory|my preference|my goal|my habit)\b/i.test(input.message);
}
