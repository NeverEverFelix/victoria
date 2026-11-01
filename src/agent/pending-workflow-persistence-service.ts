import type { AgentDecision, AgentRequest } from "./types.js";
import { isPendingCorrectionReplacementRequest, isPendingGoalRetargetRequest } from "./conversation-routing.js";
import { interpretApprovalResponse } from "./policy.js";
import { isValidRestoredPlanningChoice } from "./planning-response-policy.js";
import { isPendingFinancialWorkflowExpired } from "./pending-workflow-policy.js";
import type { PendingSavingsActionStore } from "./pending-savings-action-store.js";
import type { PendingGoalAllocationActionStore } from "./pending-goal-allocation-store.js";
import type { PendingEntryCorrectionStore } from "./pending-entry-correction-store.js";
import { PendingSavingsProposalService } from "./pending-savings-proposal-service.js";
import { PendingGoalAllocationService } from "./pending-goal-allocation-service.js";
import { PendingEntryCorrectionService } from "./pending-entry-correction-service.js";

/** Owns durable restoration, expiry, and terminal persistence for pending workflows. */
export class PendingWorkflowPersistenceService {
  constructor(private readonly dependencies: {
    readonly savingsStore?: PendingSavingsActionStore;
    readonly goalAllocationStore?: PendingGoalAllocationActionStore;
    readonly entryCorrectionStore?: PendingEntryCorrectionStore;
    readonly savings: PendingSavingsProposalService;
    readonly goalAllocations: PendingGoalAllocationService;
    readonly corrections: PendingEntryCorrectionService;
  }) {}

  expireForRequest(request: AgentRequest): void {
    const conversationKey = workflowConversationKey(request);
    this.dependencies.savings.expireForConversation(
      request.userId, conversationKey, isPendingFinancialWorkflowExpired
    );
    this.dependencies.goalAllocations.expireForConversation(
      request.userId, conversationKey, isPendingFinancialWorkflowExpired
    );
    this.dependencies.corrections.expireForConversation(
      request.userId, conversationKey, isPendingFinancialWorkflowExpired
    );
  }

  async restoreSavings(request: AgentRequest): Promise<void> {
    const store = this.dependencies.savingsStore;
    if (!store) return;
    const pending = await store.getPending(request.userId, request.conversationId ?? "default");
    if (!pending) return;
    const { decision } = pending;
    if (
      pending.actionId !== decision.toolCall?.actionId ||
      decision.toolCall.name !== "createSavingsEntry" ||
      decision.proposal?.status !== "pending" ||
      decision.proposal.actionId !== pending.actionId ||
      decision.proposal.userId !== request.userId ||
      decision.savingsEvent?.userId !== request.userId ||
      (decision.planningChoice !== undefined && !isValidRestoredPlanningChoice(decision))
    ) return;
    this.dependencies.savings.set(pending.actionId, {
      userId: request.userId,
      conversationKey: workflowConversationKey(request),
      decision: pending.decision,
      ...(pending.awaitingValidRevision ? { awaitingValidRevision: true } : {}),
      ...(pending.awaitingRevisionTarget ? { awaitingRevisionTarget: true } : {})
    });
  }

  async restoreGoalAllocation(request: AgentRequest): Promise<void> {
    const store = this.dependencies.goalAllocationStore;
    if (!store) return;
    const pending = await store.getPending(request.userId, request.conversationId ?? "default");
    if (!pending) return;
    const { decision } = pending;
    if (
      pending.actionId !== decision.toolCall?.actionId ||
      decision.toolCall.name !== "createSavingsGoalAllocation" ||
      decision.goalAllocation?.status !== "pending" ||
      decision.goalAllocation.userId !== request.userId
    ) return;
    this.dependencies.goalAllocations.set(pending.actionId, {
      userId: request.userId,
      conversationKey: workflowConversationKey(request),
      decision: pending.decision,
      ...(pending.approval ? { approval: pending.approval } : {})
    });
  }

  async restoreEntryCorrection(request: AgentRequest): Promise<void> {
    const store = this.dependencies.entryCorrectionStore;
    if (!store) return;
    const pending = await store.getPending(request.userId, request.conversationId ?? "default");
    if (!pending) return;
    const decision = pending.decision;
    if (pending.actionId !== decision.toolCall?.actionId ||
        decision.toolCall.name !== "createSavingsEntryCorrection" ||
        !decision.entryCorrection || !("status" in decision.entryCorrection) ||
        decision.entryCorrection.status !== "pending" || decision.entryCorrection.userId !== request.userId) return;
    this.dependencies.corrections.set(pending.actionId, {
      userId: request.userId,
      conversationKey: workflowConversationKey(request),
      decision
    });
  }

  async persistSavings(request: AgentRequest, responseDecision: AgentDecision): Promise<void> {
    const store = this.dependencies.savingsStore;
    if (!store) return;
    const current = this.dependencies.savings.getForConversation(
      request.userId, workflowConversationKey(request)
    );
    const actionId = current?.actionId;
    const pending = current?.state;
    await store.commit({
      userId: request.userId,
      conversationId: request.conversationId ?? "default",
      ...(pending ? { pendingAction: {
        actionId: actionId!,
        decision: pending.decision,
        ...(pending.awaitingValidRevision ? { awaitingValidRevision: true } : {}),
        ...(pending.awaitingRevisionTarget ? { awaitingRevisionTarget: true } : {})
      } } : {}),
      responseDecision
    });
  }

  async persistGoalAllocation(
    request: AgentRequest,
    responseDecision: AgentDecision,
    priorActionId?: string,
    priorDecision?: AgentDecision
  ): Promise<void> {
    const store = this.dependencies.goalAllocationStore;
    if (!store) return;
    const current = this.dependencies.goalAllocations.getForConversation(
      request.userId, workflowConversationKey(request)
    );
    const actionId = current?.actionId;
    const pending = current?.state;
    let terminalAction: { actionId: string; status: "recorded" | "declined" | "superseded" } | undefined;
    if (responseDecision.action === "record_goal_allocation") {
      if (responseDecision.goalAllocation?.status === "recorded") {
        terminalAction = { actionId: responseDecision.goalAllocation.approvedActionId, status: "recorded" };
      }
    } else if (pending && priorActionId && priorActionId !== actionId) {
      terminalAction = { actionId: priorActionId, status: "superseded" };
    } else if (priorActionId && isPendingGoalRetargetRequest(request.message)) {
      terminalAction = { actionId: priorActionId, status: "superseded" };
    } else if (priorActionId && priorDecision?.goalAllocation &&
      interpretApprovalResponse(request.message, priorDecision.goalAllocation.amountCents) === "explicit_decline") {
      terminalAction = { actionId: priorActionId, status: "declined" };
    }
    await store.commit({
      userId: request.userId,
      conversationId: request.conversationId ?? "default",
      ...(responseDecision.goalAllocation?.status === "recorded" ? {
        approvalAction: {
          actionId: responseDecision.goalAllocation.approvedActionId,
          approval: responseDecision.goalAllocation.approval
        }
      } : {}),
      ...(pending && actionId ? {
        pendingAction: {
          actionId,
          decision: pending.decision,
          ...(pending.approval ? { approval: pending.approval } : {})
        }
      } : {}),
      ...(terminalAction ? { terminalAction } : {})
    });
  }

  async persistEntryCorrection(
    request: AgentRequest,
    responseDecision: AgentDecision,
    priorActionId?: string,
    priorDecision?: AgentDecision
  ): Promise<void> {
    const store = this.dependencies.entryCorrectionStore;
    if (!store) return;
    const current = this.dependencies.corrections.getForConversation(
      request.userId, workflowConversationKey(request)
    );
    const actionId = current?.actionId;
    const pending = current?.state;
    let terminalAction: { actionId: string; status: "recorded" | "declined" | "superseded" } | undefined;
    if (responseDecision.entryCorrection && !("status" in responseDecision.entryCorrection)) {
      terminalAction = { actionId: responseDecision.entryCorrection.approvedActionId, status: "recorded" };
    } else if (priorActionId && isPendingCorrectionReplacementRequest(request.message)) {
      terminalAction = { actionId: priorActionId, status: "superseded" };
    } else if (priorActionId && priorDecision?.entryCorrection && "status" in priorDecision.entryCorrection &&
        priorDecision.entryCorrection.status === "pending" &&
        interpretApprovalResponse(request.message, priorDecision.entryCorrection.correctedAmountCents) === "explicit_decline") {
      terminalAction = { actionId: priorActionId, status: "declined" };
    }
    await store.commit({
      userId: request.userId,
      conversationId: request.conversationId ?? "default",
      ...(pending && actionId ? { pendingAction: { actionId, decision: pending.decision } } : {}),
      ...(terminalAction ? { terminalAction } : {})
    });
  }
}

function workflowConversationKey(request: AgentRequest): string {
  return JSON.stringify([request.userId, request.conversationId ?? "default"]);
}
