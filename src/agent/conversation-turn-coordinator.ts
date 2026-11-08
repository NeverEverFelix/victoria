import {
  shouldDispatchConversationIntent,
  shouldSkipFinancialAssessmentForAdvisoryTurn,
  type ConversationIntentPlan
} from "./conversation-intent-plan.js";
import type { AdvisoryTurnPlan } from "./turn-understanding.js";
import type { ClassifiedMessage } from "./types.js";

export type ConversationTurnRoute = "read_only" | "pending_workflow" | "financial_workflow";
export type PendingWorkflowDisposition = "none" | "referenced" | "revision_requested" | "read_only_question" | "ambiguous" | "unrelated";

/** Whole-turn interpretation assembled for routing; descriptive fields never authorize a mutation. */
export interface CoordinatedConversationTurn {
  readonly route: ConversationTurnRoute;
  readonly responseFocus?: string;
  readonly readOnlyQuestions: readonly string[];
  readonly recognizedFinancialEvent: ClassifiedMessage["type"];
  readonly requestedAction: ConversationIntentPlan["actionRequest"]["kind"];
  readonly pendingWorkflowDisposition: PendingWorkflowDisposition;
  readonly skipFinancialAssessment: boolean;
}

export function coordinateConversationTurn(input: {
  readonly message: string;
  readonly deterministicPlan: ConversationIntentPlan;
  readonly advisoryPlan: AdvisoryTurnPlan;
  readonly financialClassificationType: ClassifiedMessage["type"];
  readonly hasPendingWorkflow: boolean;
  readonly responderEnabled: boolean;
}): CoordinatedConversationTurn {
  const { message, deterministicPlan, advisoryPlan, financialClassificationType, hasPendingWorkflow } = input;
  const readOnly = input.responderEnabled && shouldDispatchConversationIntent({
    message,
    deterministicPlan,
    advisoryPlan,
    financialClassificationType
  });
  const pendingWorkflowDisposition: PendingWorkflowDisposition = !hasPendingWorkflow
    ? "none"
    : deterministicPlan.readOnlyQuestions.length > 0 &&
        (deterministicPlan.workflowRelation === "revises_pending" ||
          deterministicPlan.workflowRelation === "references_pending")
      ? "read_only_question"
    : deterministicPlan.workflowRelation === "revises_pending"
      ? "revision_requested"
      : deterministicPlan.workflowRelation === "references_pending"
        ? "referenced"
        : deterministicPlan.workflowRelation === "asks_about_pending"
          ? "read_only_question"
          : deterministicPlan.workflowRelation === "ambiguous"
            ? "ambiguous"
            : "unrelated";

  return Object.freeze({
    route: readOnly ? "read_only" : hasPendingWorkflow ? "pending_workflow" : "financial_workflow",
    ...(deterministicPlan.readOnlyQuestions[0]
      ? { responseFocus: deterministicPlan.readOnlyQuestions[0] }
      : {}),
    readOnlyQuestions: deterministicPlan.readOnlyQuestions,
    recognizedFinancialEvent: financialClassificationType,
    requestedAction: deterministicPlan.actionRequest.kind,
    pendingWorkflowDisposition,
    skipFinancialAssessment: input.responderEnabled && shouldSkipFinancialAssessmentForAdvisoryTurn({
      message,
      deterministicPlan,
      advisoryPlan
    })
  });
}
