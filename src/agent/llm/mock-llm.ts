import type { ClassifiedMessage } from "../types.js";
import { parseExplicitDollarAmountCents } from "../../domain/financial-events/parse-explicit-amount.js";
import type { ClassifyMessageInput, DraftResponseInput, LlmAdapter } from "./types.js";

export class MockLlmAdapter implements LlmAdapter {
  async classifyMessage(input: ClassifyMessageInput): Promise<ClassifiedMessage> {
    const message = input.userMessage.toLowerCase();
    const amountCents = parseExplicitDollarAmountCents(message);
    const merchantName = inferMerchantName(message);

    if (message.includes("instead of") || message.includes("almost bought") || message.includes("cooked")) {
      return {
        type: "avoided_spend",
        confidence: 0.8,
        ...(amountCents !== undefined ? { amountCents } : {}),
        ...(merchantName !== undefined ? { merchantName } : {}),
        summary: input.userMessage,
        needsClarification:
          amountCents === undefined &&
          merchantName === undefined &&
          !message.includes("instead of") &&
          !message.includes("almost bought")
      };
    }

    if (message.includes("regret") || message.includes("should not have")) {
      return {
        type: "regretful_spend",
        confidence: 0.8,
        ...(amountCents !== undefined ? { amountCents } : {}),
        ...(merchantName !== undefined ? { merchantName } : {}),
        summary: input.userMessage,
        needsClarification: false
      };
    }

    if (message.includes("goal") || message.includes("emergency fund") || message.includes("put this toward")) {
      return {
        type: "goal_allocation",
        confidence: 0.75,
        ...(amountCents !== undefined ? { amountCents } : {}),
        ...(message.includes("emergency fund") ? { goalName: "Emergency fund" } : {}),
        summary: input.userMessage,
        needsClarification: false
      };
    }

    return {
      type: "unclear",
      confidence: 0.3,
      ...(amountCents !== undefined ? { amountCents } : {}),
      summary: input.userMessage,
      needsClarification: true
    };
  }

  async draftResponse(input: DraftResponseInput): Promise<string> {
    return input.responseGoal;
  }
}

function inferMerchantName(message: string): string | undefined {
  if (message.includes("7th street")) {
    return "7th Street";
  }

  if (message.includes("doordash")) {
    return "DoorDash";
  }

  if (message.includes("blue bottle")) {
    return "Blue Bottle";
  }

  return undefined;
}
