import { formatUsd } from "../domain/money.js";
import type { SavingsEntry } from "../domain/savings/types.js";
import type { PendingGoalAllocationService } from "./pending-goal-allocation-service.js";
import type { AgentDecision, AgentRequest, AgentResponse, ClassifiedMessage, PendingSavingsGoalAllocation } from "./types.js";

/** Resolves a completed mocked entry and prepares an approval-gated goal allocation. */
export class PendingGoalAllocationProposalService {
  constructor(private readonly dependencies: {
    readonly pendingAllocations: PendingGoalAllocationService;
    readonly resolveRecentEntry: (request: AgentRequest, conversationKey: string) => Promise<SavingsEntry | undefined>;
    readonly getEffectiveAmount: (userId: string, entryId: string) => Promise<number | null>;
  }) {}

  async propose(input: {
    readonly request: AgentRequest;
    readonly conversationKey: string;
    readonly classification: ClassifiedMessage;
    readonly createIds: () => { readonly actionId: string; readonly allocationId: string };
  }): Promise<AgentResponse | undefined> {
    const { request, conversationKey, classification, createIds } = input;
    if (classification.type !== "goal_allocation" || !classification.goalName) return undefined;
    const entry = await this.dependencies.resolveRecentEntry(request, conversationKey);
    if (!entry || entry.userId !== request.userId) return undefined;

    let amountCents: number | null;
    try {
      amountCents = await this.dependencies.getEffectiveAmount(request.userId, entry.id);
    } catch {
      amountCents = null;
    }
    if (amountCents === null) {
      const message = "I couldn't verify the current amount for that saved entry, so I haven't linked it to a goal.";
      return { message, decision: { action: "ask_follow_up", classification, userFacingMessage: message } };
    }

    const { actionId, allocationId } = createIds();
    const allocation: PendingSavingsGoalAllocation = {
      id: allocationId,
      userId: request.userId,
      savingsEntryId: entry.id,
      amountCents,
      goalName: classification.goalName,
      status: "pending",
      createdAt: new Date().toISOString()
    };
    const message = `I can link the currently recorded ${formatUsd(amountCents)} entry to ${allocation.goalName} in your mocked savings ledger. Please confirm this goal allocation. No real money has moved yet. This is only a mocked ledger record.`;
    const decision: AgentDecision = {
      action: "update_goal",
      classification,
      goalAllocation: allocation,
      toolCall: {
        name: "createSavingsGoalAllocation",
        actionId,
        arguments: {
          userId: request.userId,
          savingsEntryId: entry.id,
          amountCents,
          goalName: allocation.goalName
        },
        requiresApproval: true
      },
      userFacingMessage: message
    };
    this.dependencies.pendingAllocations.set(actionId, { userId: request.userId, conversationKey, decision });
    return { message, decision };
  }
}
