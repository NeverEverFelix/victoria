import type { ClassifiedMessage } from "./types.js";

/** Choose a bounded, purpose-specific question without granting action authority. */
export function clarificationMessage(classification: ClassifiedMessage): string {
  if (classification.type === "unclear" && classification.uncertainIntent === "general_finance") {
    return "I may have misunderstood. Could you tell me a little more about what you mean?";
  }
  if (classification.uncertainIntent === "goal_allocation") {
    return "I may have misunderstood the goal request. Which saved amount and goal should I link? Nothing has changed.";
  }
  if (classification.uncertainIntent === "proposal_revision") {
    return "I may have misunderstood the requested revision. Which amount or reason should I change? The current proposal is unchanged.";
  }
  if (classification.uncertainIntent === "entry_correction") {
    return "I may have misunderstood the correction. Which recorded amount should I correct to? The ledger entry is unchanged.";
  }
  if (classification.amountIssue === "invalid_value") {
    return "A savings amount must be positive. What positive amount in USD should I use?";
  }
  if (classification.amountIssue === "multiple_amounts") {
    return "I found more than one dollar amount. Which single amount in USD should I use?";
  }
  if (classification.amountIssue === "invalid_precision") {
    return "That amount has more than two decimal places. What amount in USD should I use?";
  }
  if (classification.amountIssue === "unsupported_currency") {
    return "I can only record USD amounts in the MVP. What is the amount in USD?";
  }
  return "I can help with that. What did you avoid spending on, and about how much would it have cost?";
}
