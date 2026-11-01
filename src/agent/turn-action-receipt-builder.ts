import type { AgentDecision, AgentRequest, TurnActionReceipt } from "./types.js";

export type RecoverableMockLedgerAction = Extract<
  AgentDecision["action"],
  "create_ledger_entry" | "correct_ledger_entry" | "record_goal_allocation"
>;

/** Builds the minimal owner-scoped result stored atomically with an approved mock-ledger mutation. */
export function buildTurnActionReceipt(
  request: AgentRequest,
  sourceDecision: AgentDecision,
  action: RecoverableMockLedgerAction,
  message: string
): TurnActionReceipt | undefined {
  if (!request.turnId) return undefined;
  return {
    turnId: request.turnId,
    userId: request.userId,
    conversationId: request.conversationId ?? "default",
    message,
    decision: {
      action,
      classification: sourceDecision.classification,
      userFacingMessage: message
    }
  };
}
