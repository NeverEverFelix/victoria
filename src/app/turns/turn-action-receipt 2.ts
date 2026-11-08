import type { AgentResponse } from "../../agent/types.js";

/** Guards the restricted result shape committed atomically with an approved mock-ledger mutation. */
export function isTurnActionReceipt(value: unknown): value is AgentResponse {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const response = value as Partial<AgentResponse>;
  const decision = response.decision;
  if (typeof response.message !== "string" || !decision || typeof decision !== "object") return false;
  if (decision.action !== "create_ledger_entry" && decision.action !== "correct_ledger_entry" &&
      decision.action !== "record_goal_allocation") return false;
  const classification = decision.classification;
  return typeof decision.userFacingMessage === "string" && Boolean(classification) &&
    typeof classification?.type === "string" && typeof classification.summary === "string" &&
    Number.isFinite(classification.confidence) && typeof classification.needsClarification === "boolean";
}
