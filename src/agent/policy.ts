import type { AgentRequest, MoneyMovementMode, ToolCallRequest } from "./types.js";

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}

export function canCallTool(request: AgentRequest, toolCall: ToolCallRequest): PolicyDecision {
  if (toolCall.name === "eventuallyMoveMoney" || toolCall.movementMode === "real_transfer") {
    return {
      allowed: false,
      reason: "Real money movement is not available in the Victoria MVP."
    };
  }

  if (toolCall.name === "createSavingsEntry" && toolCall.requiresApproval) {
    return requireApproval(
      request,
      toolCall.actionId,
      "Savings ledger entries require approval for this exact action."
    );
  }

  return { allowed: true };
}

export function canUseMovementMode(
  _request: AgentRequest,
  movementMode: MoneyMovementMode
): PolicyDecision {
  if (movementMode === "real_transfer") {
    return {
      allowed: false,
      reason: "Real money movement is not available in the Victoria MVP."
    };
  }

  return { allowed: true };
}

function requireApproval(
  request: AgentRequest,
  expectedActionId: string | undefined,
  reason: string
): PolicyDecision {
  if (!expectedActionId || request.approvedActionId !== expectedActionId) {
    return { allowed: false, reason };
  }

  return { allowed: true };
}
