import { formatUsd } from "../domain/money.js";
import type { SavingsEntry } from "../domain/savings/types.js";
import type { PendingEntryCorrectionService } from "./pending-entry-correction-service.js";
import type { AgentDecision, AgentRequest, AgentResponse, ClassifiedMessage, PendingSavingsEntryCorrection } from "./types.js";

/** Resolves a scoped completed entry and prepares an approval-gated correction proposal. */
export class PendingEntryCorrectionProposalService {
  constructor(private readonly dependencies: {
    readonly pendingCorrections: PendingEntryCorrectionService;
    readonly resolveRecentEntry: (request: AgentRequest, conversationKey: string) => Promise<SavingsEntry | undefined>;
    readonly getEffectiveAmount: (userId: string, entryId: string) => Promise<number | null>;
  }) {}

  async propose(input: {
    readonly request: AgentRequest;
    readonly conversationKey: string;
    readonly classification: ClassifiedMessage;
    readonly createIds: () => { readonly actionId: string; readonly correctionId: string };
  }): Promise<AgentResponse | undefined> {
    const { request, conversationKey, classification, createIds } = input;
    if (classification.type !== "entry_correction") return undefined;
    const recentEntry = await this.dependencies.resolveRecentEntry(request, conversationKey);
    if (!recentEntry || recentEntry.userId !== request.userId) {
      const message = "Which recorded savings entry would you like to correct? I can only match an entry from this conversation.";
      return { message, decision: { action: "ask_follow_up", classification, userFacingMessage: message } };
    }
    if (classification.amountIssue || classification.amountCents === undefined) {
      const message = classification.amountIssue
        ? "Please give one positive USD amount with no more than two decimal places. The recorded entry is unchanged."
        : "What should the corrected amount be in USD? The recorded entry is unchanged until you confirm.";
      return { message, decision: { action: "ask_follow_up", classification, userFacingMessage: message } };
    }
    const currentAmount = await this.dependencies.getEffectiveAmount(request.userId, recentEntry.id);
    if (currentAmount === null) {
      const message = "I couldn't find that completed mocked ledger entry, so it has not been changed.";
      return { message, decision: { action: "ask_follow_up", classification, userFacingMessage: message } };
    }
    if (classification.amountCents === currentAmount) {
      const message = `That entry is already recorded as ${formatUsd(currentAmount)}. It remains unchanged.`;
      return { message, decision: { action: "reflect", classification, userFacingMessage: message } };
    }

    const { actionId, correctionId } = createIds();
    const correction: PendingSavingsEntryCorrection = {
      id: correctionId,
      userId: request.userId,
      savingsEntryId: recentEntry.id,
      correctedAmountCents: classification.amountCents,
      adjustmentCents: classification.amountCents - currentAmount,
      reason: classification.revisionReason ?? "User corrected the recorded savings amount.",
      status: "pending",
      createdAt: new Date().toISOString()
    };
    const deltaText = correction.adjustmentCents > 0
      ? `increase the recorded amount by ${formatUsd(correction.adjustmentCents)}`
      : `reduce the recorded amount by ${formatUsd(-correction.adjustmentCents)}`;
    const message = `The most recently recorded entry in this conversation is currently ${formatUsd(currentAmount)}. I can ${deltaText}, making the corrected total ${formatUsd(correction.correctedAmountCents)} in your mocked Victoria savings ledger. The original entry will stay in the history. Please confirm this correction. No real money has moved.`;
    const decision: AgentDecision = {
      action: "correct_ledger_entry" as const,
      classification,
      entryCorrection: correction,
      toolCall: {
        name: "createSavingsEntryCorrection",
        actionId,
        arguments: {
          savingsEntryId: recentEntry.id,
          correctedAmountCents: correction.correctedAmountCents,
          reason: correction.reason
        },
        requiresApproval: true
      },
      userFacingMessage: message
    };
    this.dependencies.pendingCorrections.set(actionId, { userId: request.userId, conversationKey, decision });
    return { message, decision };
  }
}
