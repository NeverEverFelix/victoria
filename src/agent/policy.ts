import type { AgentRequest, MoneyMovementMode, ToolCallRequest } from "./types.js";

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}

export function canCallTool(request: AgentRequest, toolCall: ToolCallRequest): PolicyDecision {
  if (toolCall.name === "eventuallyMoveMoney") {
    return requireApproval(request, "Real money movement requires explicit approval.");
  }

  if (toolCall.name === "createSavingsEntry" && toolCall.requiresApproval) {
    return requireApproval(request, "Savings ledger entries require explicit approval.");
  }

  if (toolCall.movementMode === "real_transfer") {
    return requireApproval(request, "Real transfers require explicit approval.");
  }

  return { allowed: true };
}

export function canUseMovementMode(
  request: AgentRequest,
  movementMode: MoneyMovementMode
): PolicyDecision {
  if (movementMode === "real_transfer") {
    return requireApproval(request, "Real transfers require explicit approval.");
  }

  return { allowed: true };
}

function requireApproval(request: AgentRequest, reason: string): PolicyDecision {
  if (!request.approvedActionId) {
    return { allowed: false, reason };
  }

  return { allowed: true };
}

