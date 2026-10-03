import { describe, expect, it } from "vitest";
import {
  MockLlmAdapter,
  MockMemoryProvider,
  MockVictoriaTools,
  VictoriaAgent
} from "../../../src/agent/index.js";
import type { UserHabit } from "../../../src/agent/types.js";

describe("VictoriaAgent", () => {
  it("[INT-002] [AUD-001] [AUD-004] completes the explicit-amount savings loop through conversation", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);

    const suggestion = await agent.respond({
      userId: "user_123",
      conversationId: "conversation_123",
      message: "I almost bought a $90 jacket but decided to wait."
    });

    expect(suggestion.decision.action).toBe("suggest_savings");
    expect(suggestion.decision.savingsEvent).toMatchObject({
      id: "event_1",
      userId: "user_123",
      type: "avoided_spend",
      summary: "I almost bought a $90 jacket but decided to wait.",
      userProvidedAmountCents: 9000
    });
    expect(suggestion.decision.proposal).toMatchObject({
      id: "proposal_1",
      eventId: "event_1",
      userId: "user_123",
      status: "pending",
      suggestion: {
        amountCents: 9000,
        source: "user_provided",
        movementMode: "mock_ledger"
      }
    });
    expect(suggestion.message).toContain("$90.00");
    expect(suggestion.message).toContain("amount you provided");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const confirmation = await agent.respond({
      userId: "user_123",
      conversationId: "conversation_123",
      message: "Yes"
    });

    expect(confirmation.decision.action).toBe("create_ledger_entry");
    expect(confirmation.decision.proposal).toMatchObject({
      id: "proposal_1",
      eventId: "event_1",
      userId: "user_123",
      status: "recorded",
      approval: {
        id: "approval_1",
        proposalId: "proposal_1",
        userId: "user_123",
        actionId: "savings_action_1",
        source: "user_message"
      }
    });
    expect(confirmation.message).toBe(
      "Done. I recorded $90.00 in your Victoria savings ledger. No real money has moved yet."
    );
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([
      {
        userId: "user_123",
        eventId: "event_1",
        proposalId: "proposal_1",
        approvalId: "approval_1",
        approvedActionId: "savings_action_1",
        amountCents: 9000,
        movementMode: "mock_ledger",
        status: "completed"
      }
    ]);
  });

  it("[APR-003] does not treat ambiguous confirmation language as approval", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);

    await agent.respond({
      userId: "user_123",
      conversationId: "conversation_123",
      message: "I almost bought a $90 jacket but decided to wait."
    });

    const response = await agent.respond({
      userId: "user_123",
      conversationId: "conversation_123",
      message: "Sure, I guess"
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.message).toContain("clear yes or no");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[APR-004] declines a pending savings proposal without pressure or a ledger entry", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "conversation_123" };
    const suggestion = await agent.respond({
      ...context,
      message: "I almost bought a $90 jacket but decided to wait."
    });

    const response = await agent.respond({ ...context, message: "Not today." });

    expect(response.decision.action).toBe("reflect");
    expect(response.decision.proposal).toMatchObject({
      id: "proposal_1",
      status: "declined",
      eventId: "event_1"
    });
    expect(response.decision.proposal).toHaveProperty("declinedAt");
    expect(response.message).toBe("No problem. I won't record it.");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const afterDecline = await agent.respond({ ...context, message: "Yes" });
    expect(afterDecline.decision.action).not.toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
    expect(suggestion.decision.proposal?.status).toBe("pending");
  });

  it("does not create a second entry when confirmation is repeated", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = {
      userId: "user_123",
      conversationId: "conversation_123"
    };

    await agent.respond({
      ...context,
      message: "I almost bought a $90 jacket but decided to wait."
    });
    await agent.respond({ ...context, message: "Yes" });
    const repeated = await agent.respond({ ...context, message: "Yes" });

    expect(repeated.decision.action).not.toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries("user_123")).toHaveLength(1);
  });

  it("suggests saving avoided spend without creating a ledger entry immediately", async () => {
    const agent = createAgent([
      {
        id: "habit_7th_street",
        merchantName: "7th Street",
        typicalAmountCents: 2746,
        currency: "USD",
        confidence: 0.9
      }
    ]);

    const response = await agent.respond({
      userId: "user_123",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });

    expect(response.decision.action).toBe("suggest_savings");
    expect(response.decision.suggestion?.amountCents).toBe(2746);
    expect(response.decision.toolCall?.name).toBe("createSavingsEntry");
    expect(response.decision.toolCall?.actionId).toBeTruthy();
    expect(response.decision.toolCall?.requiresApproval).toBe(true);
    expect(response.message).toContain("$27.46");
    expect(response.message).toContain("record");
    expect(response.message).toContain("No real money has moved yet.");
  });

  it("refuses to create a savings ledger entry without approval", async () => {
    const agent = createAgent([
      {
        id: "habit_7th_street",
        merchantName: "7th Street",
        typicalAmountCents: 2746,
        currency: "USD",
        confidence: 0.9
      }
    ]);

    const initialResponse = await agent.respond({
      userId: "user_123",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    const approvalResponse = await agent.approveToolCall(
      {
        userId: "user_123",
        message: "yes save it"
      },
      initialResponse.decision
    );

    expect(approvalResponse.decision.action).toBe("refuse");
    expect(approvalResponse.message).toBe(
      "Savings ledger entries require approval for this exact action."
    );
  });

  it("creates a mocked ledger entry after explicit approval", async () => {
    const agent = createAgent([
      {
        id: "habit_7th_street",
        merchantName: "7th Street",
        typicalAmountCents: 2746,
        currency: "USD",
        confidence: 0.9
      }
    ]);

    const initialResponse = await agent.respond({
      userId: "user_123",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    const actionId = requireActionId(initialResponse.decision.toolCall?.actionId);

    const approvalResponse = await agent.approveToolCall(
      {
        userId: "user_123",
        message: "yes save it",
        approvedActionId: actionId
      },
      initialResponse.decision
    );

    expect(approvalResponse.decision.action).toBe("create_ledger_entry");
    expect(approvalResponse.message).toBe(
      "Done. I recorded $27.46 in your Victoria savings ledger. No real money has moved yet."
    );
  });

  it("refuses an approval id that does not match the pending savings action", async () => {
    const agent = createAgent([
      {
        id: "habit_7th_street",
        merchantName: "7th Street",
        typicalAmountCents: 2746,
        currency: "USD",
        confidence: 0.9
      }
    ]);

    const initialResponse = await agent.respond({
      userId: "user_123",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    const approvalResponse = await agent.approveToolCall(
      {
        userId: "user_123",
        message: "yes save it",
        approvedActionId: "action_other"
      },
      initialResponse.decision
    );

    expect(approvalResponse.decision.action).toBe("refuse");
    expect(approvalResponse.message).toBe("That approval does not match a pending savings action.");
  });

  it("refuses another user attempting to approve a pending savings action", async () => {
    const agent = createAgent([
      {
        id: "habit_7th_street",
        merchantName: "7th Street",
        typicalAmountCents: 2746,
        currency: "USD",
        confidence: 0.9
      }
    ]);

    const initialResponse = await agent.respond({
      userId: "user_123",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    const actionId = requireActionId(initialResponse.decision.toolCall?.actionId);

    const approvalResponse = await agent.approveToolCall(
      {
        userId: "user_other",
        message: "yes save it",
        approvedActionId: actionId
      },
      initialResponse.decision
    );

    expect(approvalResponse.decision.action).toBe("refuse");
    expect(approvalResponse.message).toBe("That approval does not match a pending savings action.");
  });

  it("refuses replaying an approval after the pending action is completed", async () => {
    const agent = createAgent([
      {
        id: "habit_7th_street",
        merchantName: "7th Street",
        typicalAmountCents: 2746,
        currency: "USD",
        confidence: 0.9
      }
    ]);

    const initialResponse = await agent.respond({
      userId: "user_123",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    const actionId = requireActionId(initialResponse.decision.toolCall?.actionId);
    const approvalRequest = {
      userId: "user_123",
      message: "yes save it",
      approvedActionId: actionId
    };

    await agent.approveToolCall(approvalRequest, initialResponse.decision);
    const replayResponse = await agent.approveToolCall(approvalRequest, initialResponse.decision);

    expect(replayResponse.decision.action).toBe("refuse");
    expect(replayResponse.message).toBe("That approval does not match a pending savings action.");
  });

  it("asks about a vague savings moment and continues after the user gives context", async () => {
    const tools = new MockVictoriaTools([
      {
        id: "habit_7th_street",
        merchantName: "7th Street",
        typicalAmountCents: 2746,
        currency: "USD",
        confidence: 0.9
      }
    ]);
    const agent = createAgent(
      [
        {
          id: "habit_7th_street",
          merchantName: "7th Street",
          typicalAmountCents: 2746,
          currency: "USD",
          confidence: 0.9
        }
      ],
      tools
    );
    const context = { userId: "user_123", conversationId: "conversation_123" };

    const response = await agent.respond({
      ...context,
      message: "I saved money today."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.classification.type).toBe("unclear");
    expect(response.decision.savingsEvent).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(response.message).toContain("What did you avoid spending on");
    expect(response.message).toContain("about how much");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const followUp = await agent.respond({
      ...context,
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });

    expect(followUp.decision.action).toBe("suggest_savings");
    expect(followUp.decision.proposal?.status).toBe("pending");
    expect(followUp.decision.suggestion?.amountCents).toBe(2746);
    expect(followUp.decision.toolCall?.requiresApproval).toBe(true);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("asks for an unknown avoided-spend amount and uses the user's answer", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "conversation_123" };

    const clarification = await agent.respond({
      ...context,
      message: "I cooked instead of ordering takeout."
    });

    expect(clarification.decision.action).toBe("ask_follow_up");
    expect(clarification.decision.classification.type).toBe("avoided_spend");
    expect(clarification.decision.savingsEvent).toMatchObject({
      id: "event_1",
      type: "avoided_spend"
    });
    expect(clarification.decision.savingsEvent?.userProvidedAmountCents).toBeUndefined();
    expect(clarification.decision.proposal).toBeUndefined();
    expect(clarification.decision.toolCall).toBeUndefined();
    expect(clarification.message).toContain("About how much");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const suggestion = await agent.respond({ ...context, message: "About $18." });

    expect(suggestion.decision.action).toBe("suggest_savings");
    expect(suggestion.decision.savingsEvent?.id).toBe(clarification.decision.savingsEvent?.id);
    expect(suggestion.decision.proposal?.status).toBe("pending");
    expect(suggestion.decision.suggestion).toMatchObject({
      amountCents: 1800,
      source: "user_provided"
    });
    expect(suggestion.decision.toolCall?.requiresApproval).toBe(true);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("responds without shame or savings action for regretful spending", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);

    const response = await agent.respond({
      userId: "user_123",
      message: "I regret spending $42 on takeout last night."
    });

    expect(response.decision.action).toBe("reflect");
    expect(response.message).toContain("No shame");
    expect(response.decision.savingsEvent).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });
});

function createAgent(
  habits: UserHabit[] = [],
  tools: MockVictoriaTools = new MockVictoriaTools(habits)
): VictoriaAgent {
  return new VictoriaAgent({
    llm: new MockLlmAdapter(),
    memory: new MockMemoryProvider(habits),
    tools
  });
}

function requireActionId(actionId: string | undefined): string {
  if (!actionId) {
    throw new Error("Expected a pending action id.");
  }

  return actionId;
}
