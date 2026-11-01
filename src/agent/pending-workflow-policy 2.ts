import { interpretApprovalResponse, type ApprovalResponse } from "./policy.js";
import {
  isPendingCorrectionReplacementRequest,
  isPendingGoalRetargetRequest,
  isSafePendingWorkflowTopicSwitch
} from "./conversation-routing.js";

export type PendingWorkflowKind = "savings_entry" | "entry_correction" | "goal_allocation";

export type PendingWorkflowMessageResolution = ApprovalResponse | "replacement_request" | "read_only_topic";

/** Resolve only how a message relates to an existing proposal; never grants mutation authority. */
export function resolvePendingWorkflowMessage(input: {
  readonly message: string;
  readonly workflow: PendingWorkflowKind;
  readonly expectedAmountCents?: number;
}): PendingWorkflowMessageResolution {
  const approval = interpretApprovalResponse(input.message, input.expectedAmountCents);
  if (approval === "explicit_approval" || approval === "explicit_decline") return approval;

  if ((input.workflow === "entry_correction" && isPendingCorrectionReplacementRequest(input.message)) ||
      (input.workflow === "goal_allocation" && isPendingGoalRetargetRequest(input.message))) {
    return "replacement_request";
  }

  if (approval === "ambiguous") return approval;
  if (isSafePendingWorkflowTopicSwitch(input.message)) return "read_only_topic";
  return "not_approval";
}
