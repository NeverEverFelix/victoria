import { formatUsd } from "../domain/money.js";
import type { AgentDecision, ClassifiedMessage, SavingsEvent, SavingsSuggestion } from "./types.js";

/** Builds an approval-gated proposal from an already validated savings estimate. */
export function buildSavingsSuggestionDecision(input: {
  readonly classification: ClassifiedMessage;
  readonly savingsEvent: SavingsEvent;
  readonly suggestion: SavingsSuggestion;
  readonly actionId: string;
  readonly proposalId: string;
  readonly createdAt: string;
}): AgentDecision {
  const { classification, savingsEvent, suggestion, actionId, proposalId, createdAt } = input;
  const dollars = formatUsd(suggestion.amountCents);
  const proposal = {
    id: proposalId,
    eventId: savingsEvent.id,
    userId: savingsEvent.userId,
    actionId,
    suggestion: {
      id: suggestion.id,
      amountCents: suggestion.amountCents,
      currency: suggestion.currency,
      reason: suggestion.reason,
      source: suggestion.source,
      movementMode: "mock_ledger" as const
    },
    status: "pending" as const,
    createdAt
  };

  const evidence = suggestion.source === "user_provided"
    ? `Using the ${dollars} amount you provided, would you like me to record it`
    : (suggestion.source === "merchant_history" || suggestion.source === "transaction_history") && classification.merchantName
      ? `Based on your usual spend at ${classification.merchantName}, I estimate you avoided spending ${dollars}. Would you like me to record that`
      : `Great job. I estimate you avoided spending ${dollars}. Would you like me to record that`;

  return {
    action: "suggest_savings",
    classification,
    savingsEvent,
    proposal,
    suggestion,
    toolCall: {
      name: "createSavingsEntry",
      actionId,
      arguments: {
        eventId: savingsEvent.id,
        proposalId,
        suggestionId: suggestion.id,
        amountCents: suggestion.amountCents,
        reason: suggestion.reason,
        movementMode: suggestion.movementMode
      },
      requiresApproval: true,
      movementMode: suggestion.movementMode
    },
    userFacingMessage: `${evidence} in your Victoria savings ledger? No real money has moved yet. This is only a mocked ledger record.`
  };
}
