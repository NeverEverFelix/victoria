import { describe, expect, it } from "vitest";
import {
  MockLlmAdapter,
  MockMemoryProvider,
  MockVictoriaTools,
  VictoriaAgent
} from "../../src/agent/index.js";
import { canCallTool } from "../../src/agent/policy.js";
import type { UserHabit } from "../../src/agent/types.js";
import { parseExplicitDollarAmountCents } from "../../src/domain/financial-events/parse-explicit-amount.js";
import { dollarsToCents, formatUsd } from "../../src/domain/money.js";
import { sumCompletedSavings } from "../../src/domain/savings/totals.js";

describe("Victoria MVP safety contract", () => {
  it("[FIN-001] [APR-006] [INT-004] refuses real money movement even with approval", () => {
    const result = canCallTool(
      {
        userId: "user_123",
        message: "Move it now.",
        approvedActionId: "action_123"
      },
      {
        name: "eventuallyMoveMoney",
        actionId: "action_123",
        arguments: {},
        requiresApproval: true,
        movementMode: "real_transfer"
      }
    );

    expect(result).toEqual({
      allowed: false,
      reason: "Real money movement is not available in the Victoria MVP."
    });
  });

  it("[ARC-002] ignores model-supplied approval and tool instructions", async () => {
    const llm = {
      classifyMessage: async () => ({
        type: "avoided_spend", confidence: 0.9, amountCents: 1200,
        summary: "Avoided a purchase", needsClarification: false,
        approved: true,
        toolCall: { name: "eventuallyMoveMoney", arguments: { amountCents: 1200 } }
      }),
      draftResponse: async () => ""
    } as unknown as ConstructorParameters<typeof VictoriaAgent>[0]["llm"];
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm, memory: new MockMemoryProvider(), tools });

    const response = await agent.respond({ userId: "user_123", message: "I skipped a purchase." });

    expect(response.decision.action).toBe("suggest_savings");
    expect(response.decision.proposal?.suggestion.amountCents).toBe(1200);
    expect(response.decision.proposal?.status).toBe("pending");
    expect(response.decision.toolCall?.name).toBe("createSavingsEntry");
    expect(response.decision.toolCall?.requiresApproval).toBe(true);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[INT-001] gives every supported conversation outcome one typed action", async () => {
    const responses = [];
    const unclearAgent = createAgent();
    responses.push(await unclearAgent.respond({ userId: "u", message: "I saved money." }));
    responses.push(await createAgent().respond({ userId: "u", message: "I almost bought a $10 snack but waited." }));
    responses.push(await createAgent().respond({ userId: "u", message: "I regret ordering takeout." }));
    responses.push(await createAgent().respond({ userId: "u", message: "Put this toward my emergency fund." }));
    responses.push(await createAgent().respond({ userId: "u", message: "How much have I saved this week?" }));

    const saveAgent = createAgent();
    await saveAgent.respond({ userId: "u", conversationId: "matrix_save", message: "I almost bought a $10 snack but waited." });
    responses.push(await saveAgent.respond({ userId: "u", conversationId: "matrix_save", message: "Yes" }));
    responses.push(await saveAgent.respond({ userId: "u", conversationId: "matrix_save", message: "Correct that recorded entry to $8." }));

    const goalAgent = createAgent();
    await goalAgent.respond({ userId: "u", conversationId: "matrix_goal", message: "I almost bought a $10 snack but waited." });
    await goalAgent.respond({ userId: "u", conversationId: "matrix_goal", message: "Yes" });
    responses.push(await goalAgent.respond({ userId: "u", conversationId: "matrix_goal", message: "Put that toward my emergency fund." }));
    responses.push(await goalAgent.respond({ userId: "u", conversationId: "matrix_goal", message: "Yes" }));

    const refusal = await unclearAgent.respond({ userId: "u", message: "Tell me something." });
    responses.push(await unclearAgent.approveToolCall(
      { userId: "u", message: "Yes", approvedActionId: "unknown_action" }, refusal.decision
    ));

    const allowedActions = new Set([
      "ask_follow_up", "suggest_savings", "create_ledger_entry", "update_goal",
      "record_goal_allocation", "correct_ledger_entry", "summarize_progress", "reflect", "refuse"
    ]);
    const allowedTools = new Set([
      "getUserHabits", "findTypicalMerchantSpend", "estimateAvoidedSpend", "createSavingsEntry",
      "scheduleReminder", "getWeeklySavingsTotal", "createSavingsGoalAllocation",
      "createSavingsEntryCorrection", "eventuallyMoveMoney"
    ]);
    for (const response of responses) {
      expect(allowedActions.has(response.decision.action)).toBe(true);
      expect(response.decision.classification).toBeDefined();
      if (response.decision.toolCall) {
        expect(allowedTools.has(response.decision.toolCall.name)).toBe(true);
        expect(response.decision.toolCall.movementMode).not.toBe("real_transfer");
      }
    }
    expect(responses.map(({ decision }) => decision.action)).toEqual([
      "ask_follow_up", "suggest_savings", "reflect", "update_goal", "summarize_progress",
      "create_ledger_entry", "correct_ledger_entry", "update_goal", "record_goal_allocation", "refuse"
    ]);
  });

  it("[INT-004] refuses a real-transfer intent returned by the classifier at runtime", async () => {
    const llm = {
      classifyMessage: async () => ({
        type: "real_money_movement_request", confidence: 1,
        summary: "Transfer money", needsClarification: false
      }),
      draftResponse: async () => ""
    } as unknown as ConstructorParameters<typeof VictoriaAgent>[0]["llm"];
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm, memory: new MockMemoryProvider(), tools });

    const response = await agent.respond({ userId: "user_123", message: "Move money now." });

    expect(response.decision.action).toBe("refuse");
    expect(response.decision.toolCall).toBeUndefined();
    expect(response.message).toContain("can't move real money");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[FIN-003] includes only completed entries in a savings total", () => {
    expect(
      sumCompletedSavings([
        { amountCents: 2746, status: "completed" },
        { amountCents: 9000, status: "pending" },
        { amountCents: 675, status: "cancelled" }
      ])
    ).toBe(2746);
  });

  it.each([0, -1, 1.5, Number.MAX_SAFE_INTEGER + 1, Number.NaN, Number.POSITIVE_INFINITY])(
    "[AMT-001] rejects invalid persisted cents: %s",
    async (amountCents) => {
      const tools = new MockVictoriaTools();
      await expect(tools.createSavingsEntry({
        userId: "user_123",
        eventId: "event_123",
        proposalId: "proposal_123",
        approvalId: "approval_123",
        suggestionId: "suggestion_123",
        amountCents,
        reason: "User-provided avoided spend.",
        movementMode: "mock_ledger",
        approvedActionId: "action_123"
      })).rejects.toThrow("Savings amount must be a positive safe integer number of cents.");
      expect(await tools.listSavingsEntries("user_123")).toEqual([]);
    }
  );

  it.each([
    {
      name: "unclear savings statement",
      message: "I saved money today.",
      expectedAction: "ask_follow_up"
    },
    {
      name: "regretful spend",
      message: "I regret ordering takeout last night.",
      expectedAction: "reflect"
    }
  ])(
    "[ARC-003] [INT-003] [STA-002] $name cannot carry a mutating tool call",
    async ({ message, expectedAction }) => {
      const response = await createAgent().respond({ userId: "user_123", message });

      expect(response.decision.action).toBe(expectedAction);
      expect(response.decision.suggestion).toBeUndefined();
      expect(response.decision.toolCall).toBeUndefined();
    }
  );

  it("[ARC-004] [FIN-002] rejects ledger creation without exact approval", async () => {
    const agent = createAgent(defaultHabits);
    const proposed = await agent.respond({
      userId: "user_123",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });

    const result = await agent.approveToolCall(
      { userId: "user_123", message: "yes" },
      proposed.decision
    );

    expect(result.decision.action).toBe("refuse");
    expect(result.message).toBe("Savings ledger entries require approval for this exact action.");
  });

  it("[APR-001] refuses an action that is not pending in this agent", async () => {
    const proposingAgent = createAgent(defaultHabits);
    const otherAgent = createAgent(defaultHabits);
    const proposed = await proposingAgent.respond({
      userId: "user_123",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    const approvedActionId = requireActionId(proposed.decision.toolCall?.actionId);

    const result = await otherAgent.approveToolCall(
      { userId: "user_123", message: "yes", approvedActionId },
      proposed.decision
    );

    expect(result.decision.action).toBe("refuse");
    expect(result.message).toBe("That approval does not match a pending savings action.");
  });

  it.each([
    {
      name: "another action",
      userId: "user_123",
      approvedActionId: "action_other"
    },
    {
      name: "another user",
      userId: "user_other",
      approvedActionId: undefined
    }
  ])("[APR-002] refuses approval from $name", async ({ userId, approvedActionId }) => {
    const agent = createAgent(defaultHabits);
    const proposed = await agent.respond({
      userId: "user_123",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    const actualActionId = requireActionId(proposed.decision.toolCall?.actionId);

    const result = await agent.approveToolCall(
      {
        userId,
        message: "yes",
        approvedActionId: approvedActionId ?? actualActionId
      },
      proposed.decision
    );

    expect(result.decision.action).toBe("refuse");
    expect(result.message).toBe("That approval does not match a pending savings action.");
  });

  it("[APR-004] [IDM-001] consumes an approved action at most once in one agent process", async () => {
    const agent = createAgent(defaultHabits);
    const proposed = await agent.respond({
      userId: "user_123",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    const approvedActionId = requireActionId(proposed.decision.toolCall?.actionId);
    const request = { userId: "user_123", message: "yes", approvedActionId };

    const first = await agent.approveToolCall(request, proposed.decision);
    const replay = await agent.approveToolCall(request, proposed.decision);

    expect(first.decision.action).toBe("create_ledger_entry");
    expect(replay.decision.action).toBe("refuse");
  });

  it("[APR-003] requires an explicit conversational approval for a pending suggestion", async () => {
    const agent = createAgent();
    const context = {
      userId: "user_123",
      conversationId: "conversation_123"
    };

    await agent.respond({
      ...context,
      message: "I almost bought a $90 jacket but decided to wait."
    });

    const ambiguous = await agent.respond({ ...context, message: "Sure, I guess" });
    const explicit = await agent.respond({ ...context, message: "Yes" });

    expect(ambiguous.decision.action).toBe("ask_follow_up");
    expect(ambiguous.decision.toolCall).toBeUndefined();
    expect(explicit.decision.action).toBe("create_ledger_entry");
  });

  it.each([
    ["I almost bought a $90 jacket.", 9000],
    ["I skipped a $6.75 coffee.", 675],
    ["I skipped coffee.", undefined]
  ])("[AMT-007] parses the currently supported explicit USD form: %s", (message, expected) => {
    expect(parseExplicitDollarAmountCents(message)).toBe(expected);
  });

  it("[AMT-006] formats USD cents with exactly two fractional digits", () => {
    expect(formatUsd(0)).toBe("$0.00");
    expect(formatUsd(675)).toBe("$6.75");
  });

  it("[AMT-003] rounds trusted numeric calculations to the nearest cent", () => {
    expect(dollarsToCents(6.755)).toBe(676);
  });

  it("[ERR-001] asks for clarification without proposing or writing when context is vague", async () => {
    const response = await createAgent().respond({
      userId: "user_123",
      message: "I saved money today."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(response.message).toContain("What did you avoid spending on");
  });

  it("[ERR-002] treats regretful spend as reflection rather than saved money", async () => {
    const response = await createAgent().respond({
      userId: "user_123",
      message: "I regret ordering takeout last night."
    });

    expect(response.decision.action).toBe("reflect");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(response.message).toContain("No shame");
  });

  it("[FIN-005] [AUD-002] [AUD-003] [AUD-005] uses honest wording before and after recording", async () => {
    const agent = createAgent(defaultHabits);
    const proposed = await agent.respond({
      userId: "user_123",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    const approvedActionId = requireActionId(proposed.decision.toolCall?.actionId);

    expect(proposed.message).toContain("I estimate");
    expect(proposed.message).toContain("Based on your usual spend at 7th Street");
    expect(proposed.message).toContain("No real money has moved yet.");
    expect(proposed.message).not.toMatch(/transferred|moved .* to savings/i);

    const recorded = await agent.approveToolCall(
      { userId: "user_123", message: "yes", approvedActionId },
      proposed.decision
    );

    expect(recorded.message).toContain("recorded $27.46 in your Victoria savings ledger");
    expect(recorded.message).toContain("No real money has moved yet.");
    expect(recorded.message).not.toMatch(/transferred|moved .* to savings/i);
  });

  it("[AUD-001] distinguishes an exact user-provided amount from an estimate", async () => {
    const response = await createAgent().respond({
      userId: "user_123",
      message: "I almost bought a $90 jacket but decided to wait."
    });

    expect(response.message).toContain("$90.00 amount you provided");
    expect(response.message).not.toContain("I estimate");
  });
});

const defaultHabits: UserHabit[] = [
  {
    id: "habit_7th_street",
    merchantName: "7th Street",
    typicalAmountCents: 2746,
    currency: "USD",
    confidence: 0.9
  }
];

function createAgent(habits: UserHabit[] = []): VictoriaAgent {
  return new VictoriaAgent({
    llm: new MockLlmAdapter(),
    memory: new MockMemoryProvider(habits),
    tools: new MockVictoriaTools(habits)
  });
}

function requireActionId(actionId: string | undefined): string {
  if (!actionId) {
    throw new Error("Expected a pending action id.");
  }

  return actionId;
}
