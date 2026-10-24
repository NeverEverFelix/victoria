import type { ClassifiedMessage } from "../types.js";
import { parseExplicitDollarAmount } from "../../domain/financial-events/parse-explicit-amount.js";
import { parseExplicitCorrectionAmount } from "../../domain/financial-events/parse-correction-amount.js";
import type { ClassifyMessageInput, DraftResponseInput, LlmAdapter } from "./types.js";
import { employerCoveredRecurringSpend, isBudgetingAdviceQuestion, isExplicitRealMoneyMovementRequest, isRealMoneyMovementRequest } from "../money-movement-intent.js";

export class MockLlmAdapter implements LlmAdapter {
  async classifyMessage(input: ClassifyMessageInput): Promise<ClassifiedMessage> {
    const message = input.userMessage.toLowerCase();
    const contextualMessage = [
      ...(isContextualReply(input.userMessage) ? (input.conversationContext ?? []).filter((item) => !item.startsWith("Victoria: ")).slice(-1) : []),
      input.userMessage
    ].join(" ").toLowerCase();
    const amountParse = parseExplicitDollarAmount(input.userMessage);
    const amountCents = amountParse.status === "valid" ? amountParse.amountCents : undefined;
    const amountIssue = amountParse.status === "invalid_value" || amountParse.status === "multiple_amounts" || amountParse.status === "invalid_precision" || amountParse.status === "unsupported_currency"
      ? amountParse.status
      : undefined;
    const revisionReason = parseRevisionReason(input.userMessage);
    const merchantName = inferMerchantName(contextualMessage);

    const employerCoveredSpend = employerCoveredRecurringSpend(input.userMessage);
    if (isExplicitRealMoneyMovementRequest(message) ||
        (isRealMoneyMovementRequest(message) && (!employerCoveredSpend || !isBudgetingAdviceQuestion(message)))) {
      return {
        type: "real_money_movement_request",
        confidence: 0.95,
        ...(amountCents !== undefined ? { amountCents } : {}),
        ...(amountIssue ? { amountIssue } : {}),
        summary: input.userMessage,
        needsClarification: false
      };
    }

    if (employerCoveredSpend) {
      return {
        type: "avoided_spend",
        confidence: 0.95,
        amountCents: employerCoveredSpend.amountCents,
        summary: input.userMessage,
        needsClarification: false
      };
    }

    if (/\b(correct|correction|fix|change|revise)\b/.test(contextualMessage) &&
        /\b(entry|recorded|saved amount|savings amount)\b/.test(contextualMessage)) {
      const correctionAmount = parseExplicitCorrectionAmount(input.userMessage);
      return {
        type: "entry_correction",
        confidence: 0.9,
        ...(correctionAmount ? { amountCents: correctionAmount.amountCents } : amountCents !== undefined ? { amountCents } : {}),
        ...(!correctionAmount && amountIssue ? { amountIssue } : {}),
        ...(revisionReason ? { revisionReason } : {}),
        summary: input.userMessage,
        needsClarification: !correctionAmount && (amountIssue !== undefined || amountCents === undefined)
      };
    }

    if (
      /\b(this|the) week\b/.test(message) &&
      /\b(saved|savings)\b/.test(message) &&
      /\b(how much|what(?:'s| is| did)?|show me|tell me)\b/.test(message)
    ) {
      return {
        type: "savings_progress",
        confidence: 0.9,
        summary: input.userMessage,
        needsClarification: false
      };
    }

    if (contextualMessage.includes("instead of") || contextualMessage.includes("almost bought") || contextualMessage.includes("cooked")) {
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
          !contextualMessage.includes("instead of") &&
          !contextualMessage.includes("almost bought")
        )
      };
    }

    if (contextualMessage.includes("regret") || contextualMessage.includes("should not have")) {
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

    const goalName = inferGoalName(input.userMessage) ?? inferGoalName(contextualMessage);
    if (contextualMessage.includes("goal") || goalName !== undefined || contextualMessage.includes("put this toward")) {
      return {
        type: "goal_allocation",
        confidence: 0.75,
        ...(amountCents !== undefined ? { amountCents } : {}),
        ...(goalName !== undefined ? { goalName } : {}),
        summary: input.userMessage,
        needsClarification: false
      };
    }

    if (
      revisionReason !== undefined ||
      /\b(change|correct|correction|update|revise|replace|make that|make it)\b/.test(contextualMessage) ||
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

    if (/^\s*(?:how much do i (?:usually )?spend|what do i spend|what is my typical spend)\b/i.test(input.userMessage)) {
      return {
        type: "general_finance",
        confidence: 0.9,
        summary: input.userMessage,
        needsClarification: false
      };
    }

    const directPersonalStatement = /^\s*(?:i(?:'m| am| have| work| usually| often| prefer| like| love| enjoy| spend| am into| need| get| do not|don't)\b|my\b|we\b)/i.test(input.userMessage);
    const naturalPersonalStatement = !directPersonalStatement &&
      !/[?]\s*$/.test(input.userMessage) && /\b(?:i|me|my|we|us|our)\b/i.test(input.userMessage) &&
      !/^\s*(?:how|what|why|when|where|who|can|could|would|should|do|does|did)\b/i.test(input.userMessage) &&
      !/\$\s*\d|\b(?:estimate|amount|ledger|transaction|saved?|savings|money|spend(?:ing)?|purchase|purchased|bought|paid|transfer(?:red)?)\b/i.test(input.userMessage);
    if ((directPersonalStatement || naturalPersonalStatement) &&
        !/\b(?:spent|paid|bought|was charged|got charged|transferred|transfer money|moved money)\b/i.test(input.userMessage)) {
      return {
        type: "general_finance",
        confidence: 0.9,
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

function isContextualReply(message: string): boolean {
  const normalized = message.trim().toLowerCase();
  if (/^(?:about\s*)?\$?\d/.test(normalized)) return false;
  return normalized.length < 40 && /^(?:yes\b|no\b|yeah\b|yep\b|i did\b|it was\b|that one\b|this one\b|emergency fund\b|trip fund\b|same amount\b)/.test(normalized);
}

function inferGoalName(message: string): string | undefined {
  const normalized = message.toLowerCase();
  if (/\bemergency fund\b/.test(normalized)) return "Emergency fund";

  const match = normalized.match(/\b(?:toward|towards)\s+(?:my\s+)?([a-z][a-z0-9' -]{1,40}?)(?:\s+(?:instead|please|goal)|[?.!,]|$)/) ??
    normalized.match(/\bgoal\s+(?:is|named|for)\s+(?:my\s+)?([a-z][a-z0-9' -]{1,35}?)(?:[?.!,]|$)/) ??
    normalized.match(/^(?:my\s+)?([a-z][a-z0-9' -]{1,35}\s+(?:fund|goal))\.?$/);
  const candidate = match?.[1]?.trim().replace(/\s+/g, " ");
  if (!candidate || /^(?:that|this|it|a goal|the goal)$/.test(candidate)) return undefined;
  return candidate.replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function parseRevisionReason(message: string): string | undefined {
  const match = message.match(/\breason\s+(?:to|is|was(?:\s+that)?)\s+(.+)$/i);
  return match?.[1]?.trim();
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
