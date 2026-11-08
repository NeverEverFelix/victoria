import { describe, expect, it } from "vitest";
import { buildTurnActionReceipt } from "../../../src/agent/turn-action-receipt-builder.js";
import type { AgentDecision, AgentRequest } from "../../../src/agent/types.js";

const request: AgentRequest = {
  userId: "user-1",
  conversationId: "conversation-1",
  turnId: "turn-1",
  message: "Yes"
};

const decision: AgentDecision = {
  action: "suggest_savings",
  classification: {
    type: "avoided_spend",
    summary: "Skipped a purchase",
    amountCents: 3_500,
    confidence: 0.95,
    needsClarification: false
  },
  userFacingMessage: "Would you like to record it?",
  toolCall: {
    name: "createSavingsEntry",
    actionId: "action-1",
    arguments: { amountCents: 3_500 },
    requiresApproval: true,
    movementMode: "mock_ledger"
  },
  suggestion: {
    id: "suggestion-1",
    amountCents: 3_500,
    currency: "USD",
    reason: "Skipped a purchase",
    source: "user_provided",
    movementMode: "mock_ledger"
  }
};

describe("buildTurnActionReceipt", () => {
  it("binds the exact turn and owner while retaining only the sanitized public decision", () => {
    const message = "Done. I recorded $35 in the mocked ledger. No real money moved.";
    const receipt = buildTurnActionReceipt(request, decision, "create_ledger_entry", message);

    expect(receipt).toEqual({
      turnId: "turn-1",
      userId: "user-1",
      conversationId: "conversation-1",
      message,
      decision: {
        action: "create_ledger_entry",
        classification: decision.classification,
        userFacingMessage: message
      }
    });
    expect(receipt?.decision).not.toHaveProperty("toolCall");
    expect(receipt?.decision).not.toHaveProperty("suggestion");
  });

  it("uses the default conversation scope and does not create a receipt without a durable turn ID", () => {
    const withoutConversation: AgentRequest = {
      userId: "user-1", turnId: "turn-1", message: "Yes"
    };
    const withoutTurn: AgentRequest = {
      userId: "user-1", conversationId: "conversation-1", message: "Yes"
    };
    expect(buildTurnActionReceipt(withoutConversation, decision,
      "correct_ledger_entry", "Corrected.")?.conversationId).toBe("default");
    expect(buildTurnActionReceipt(withoutTurn, decision,
      "record_goal_allocation", "Linked.")).toBeUndefined();
  });
});
