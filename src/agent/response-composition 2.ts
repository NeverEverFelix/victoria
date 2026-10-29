import type { AgentDecision } from "./types.js";
import type { SavingsAssessment } from "./team-prototype.js";

export interface TeamAdvice {
  readonly assessment: SavingsAssessment;
  readonly message: string;
  readonly awaitingAllocationTargetChoice?: boolean;
}

/** Select specialist wording only when it matches the validated decision. */
export function composeTeamDecisionMessage(decision: AgentDecision, teamAdvice?: TeamAdvice): string {
  if (!teamAdvice) return decision.userFacingMessage;
  const type = decision.classification.type;
  if (type === "unclear" && teamAdvice.assessment.outcome === "ask") return teamAdvice.message;
  if (type === "regretful_spend" && teamAdvice.assessment.outcome === "reflect") return teamAdvice.message;
  if (type === "avoided_spend") {
    if (decision.action === "suggest_savings" && teamAdvice.assessment.outcome === "suggest" &&
        decision.suggestion?.amountCents === teamAdvice.assessment.amountCents) return teamAdvice.message;
    if (decision.action === "ask_follow_up" && teamAdvice.assessment.outcome === "ask") return teamAdvice.message;
  }
  return decision.userFacingMessage;
}
