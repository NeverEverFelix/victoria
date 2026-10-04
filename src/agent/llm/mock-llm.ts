import type { ClassifiedMessage } from "../types.js";
import { parseExplicitDollarAmount } from "../../domain/financial-events/parse-explicit-amount.js";
import type { ClassifyMessageInput, DraftResponseInput, LlmAdapter } from "./types.js";

export class MockLlmAdapter implements LlmAdapter {
  async classifyMessage(input: ClassifyMessageInput): Promise<ClassifiedMessage> {
    const message = input.userMessage.toLowerCase();
    const amountParse = parseExplicitDollarAmount(input.userMessage);
    const amountCents = amountParse.status === "valid" ? amountParse.amountCents : undefined;
    const amountIssue = amountParse.status === "invalid_value" || amountParse.status === "multiple_amounts" || amountParse.status === "invalid_precision" || amountParse.status === "unsupported_currency"
      ? amountParse.status
      : undefined;
    const merchantName = inferMerchantName(message);

    if (isRealMoneyMovementRequest(message)) {
      return {
        type: "real_money_movement_request",
        confidence: 0.95,
        ...(amountCents !== undefined ? { amountCents } : {}),
        ...(amountIssue ? { amountIssue } : {}),
        summary: input.userMessage,
        needsClarification: false
      };
    }

    if (/\b(this|the) week\b/.test(message) && /\b(saved|save|savings)\b/.test(message)) {
      return {
        type: "savings_progress",
        confidence: 0.9,
        summary: input.userMessage,
        needsClarification: false
      };
    }

    if (message.includes("instead of") || message.includes("almost bought") || message.includes("cooked")) {
      return {
        type: "avoided_spend",
        confidence: 0.8,
        ...(amountCents !== undefined ? { amountCents } : {}),
        ...(amountIssue ? { amountIssue } : {}),
        ...(merchantName !== undefined ? { merchantName } : {}),
        summary: input.userMessage,
        needsClarification: amountIssue !== undefined || (
          amountCents === undefined &&
          merchantName === undefined &&
          !message.includes("instead of") &&
          !message.includes("almost bought")
        )
      };
    }

    if (message.includes("regret") || message.includes("should not have")) {
      return {
        type: "regretful_spend",
        confidence: 0.8,
        ...(amountCents !== undefined ? { amountCents } : {}),
        ...(amountIssue ? { amountIssue } : {}),
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

    const revisionReason = parseRevisionReason(input.userMessage);
    if (
      revisionReason !== undefined ||
      /\b(change|correct|correction|update|revise|replace|make that|make it)\b/.test(message) ||
      (message.includes("actually") && (amountCents !== undefined || amountIssue !== undefined))
    ) {
      return {
        type: "proposal_revision",
        confidence: 0.9,
        ...(amountCents !== undefined ? { amountCents } : {}),
        ...(amountIssue ? { amountIssue } : {}),
        ...(revisionReason !== undefined ? { revisionReason } : {}),
        summary: input.userMessage,
        needsClarification: amountIssue !== undefined || (amountCents === undefined && revisionReason === undefined)
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

function parseRevisionReason(message: string): string | undefined {
  const match = message.match(/\breason\s+(?:to|is|was(?:\s+that)?)\s+(.+)$/i);
  return match?.[1]?.trim();
}

function isRealMoneyMovementRequest(message: string): boolean {
  return (
    /\b(move|transfer|send)\b.{0,40}\b(money|funds|cash)\b/.test(message) ||
    /\b(money|funds|cash)\b.{0,40}\b(move|transfer|send)\b/.test(message) ||
    /\b(bank|account)\s+transfer\b/.test(message) ||
    /\b(move|transfer|send)\b.{0,35}\b(to|into)\b.{0,35}\b(savings|checking|bank|account)\b/.test(message) ||
    /\b(move|transfer|send)\b.{0,40}\b(from|between)\b.{0,40}\b(to|into)\b/.test(message)
  );
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
