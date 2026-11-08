import { formatUsd } from "../domain/money.js";
import { clarificationMessage } from "./clarification-policy.js";
import type { TeamAdvice } from "./response-composition.js";
import type {
  AgentDecision,
  AgentRequest,
  ClassifiedMessage,
  SavingsEvent
} from "./types.js";

/** Maps an assessed financial classification to a decision; mutations remain in approval-gated workflows. */
export class FinancialClassificationDecisionService {
  constructor(private readonly dependencies: {
    readonly getWeeklySavingsTotal: (userId: string) => Promise<number>;
    readonly suggestSavings: (
      request: AgentRequest,
      classification: ClassifiedMessage,
      savingsEvent?: SavingsEvent,
      teamAdvice?: TeamAdvice
    ) => Promise<AgentDecision>;
  }) {}

  async decide(input: {
    readonly request: AgentRequest;
    readonly classification: ClassifiedMessage;
    readonly savingsEvent?: SavingsEvent;
    readonly teamAdvice?: TeamAdvice;
  }): Promise<AgentDecision> {
    const { request, classification, savingsEvent, teamAdvice } = input;
    if (classification.type === "savings_progress") {
      let message: string;
      try {
        const amountCents = await this.dependencies.getWeeklySavingsTotal(request.userId);
        message = amountCents === 0
          ? "No savings have been recorded in your mocked Victoria savings ledger this week. No real money has moved yet. This is only a mocked ledger record."
          : `You have ${formatUsd(amountCents)} recorded in your mocked Victoria savings ledger this week. No real money has moved yet. This is only a mocked ledger record.`;
      } catch {
        message = "I couldn't load your weekly total just now. No real money has moved yet. This is only a mocked ledger record.";
      }

      return {
        action: "summarize_progress",
        classification,
        toolCall: {
          name: "getWeeklySavingsTotal",
          arguments: { userId: request.userId },
          requiresApproval: false
        },
        userFacingMessage: message
      };
    }

    if (classification.needsClarification || classification.type === "unclear") {
      return {
        action: "ask_follow_up",
        classification,
        userFacingMessage: clarificationMessage(classification)
      };
    }

    if (classification.type === "regretful_spend") {
      return {
        action: "reflect",
        classification,
        userFacingMessage: "No shame. Want to look at what led to it and set up a small plan for next time?"
      };
    }

    if (classification.type === "avoided_spend") {
      return this.dependencies.suggestSavings(request, classification, savingsEvent, teamAdvice);
    }

    if (classification.type === "goal_allocation") {
      return {
        action: "update_goal",
        classification,
        userFacingMessage: classification.goalName
          ? "Which saved amount should I link to that goal?"
          : "Which savings goal and saved amount do you mean?"
      };
    }

    return {
      action: "reflect",
      classification,
      userFacingMessage: "I am here with you. Tell me a little more about the money decision you are thinking through."
    };
  }
}
