import type { AgentRequest, MoneyMovementMode, ToolCallRequest } from "./types.js";

export interface PolicyDecision {
  allowed: boolean;
  reason?: string;
}

export type ApprovalResponse =
  | "explicit_approval"
  | "explicit_decline"
  | "ambiguous"
  | "not_approval";

export function interpretApprovalResponse(message: string): ApprovalResponse {
  const normalized = message
    .trim()
    .toLowerCase()
    .replace(/[.!?]+$/g, "")
    .replace(/,/g, "")
    .replace(/\s+/g, " ");

  if (["yes", "yes save it", "record it", "please do", "do it"].includes(normalized)) {
    return "explicit_approval";
  }

  if (/^(?:no(?: thanks| thank you)?(?: not today)?|nope|nah|not today|i(?:'|’)d rather not)$/.test(normalized)) {
    return "explicit_decline";
  }

  if (["ok", "okay", "sure", "sounds good"].includes(normalized) ||
    /\b(maybe|guess|probably)\b/.test(normalized)) {
    return "ambiguous";
  }

  return "not_approval";
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

  if (toolCall.name === "createSavingsGoalAllocation") {
    if (!toolCall.requiresApproval) {
      return {
        allowed: false,
        reason: "Savings goal allocations require approval for this exact action."
      };
    }

    return requireApproval(
      request,
      toolCall.actionId,
      "Savings goal allocations require approval for this exact action."
    );
  }

  if (toolCall.name === "createSavingsEntryCorrection") {
    if (!toolCall.requiresApproval) {
      return { allowed: false, reason: "Savings entry corrections require approval for this exact action." };
    }
    return requireApproval(request, toolCall.actionId, "Savings entry corrections require approval for this exact action.");
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
