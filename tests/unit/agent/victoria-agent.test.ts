import { describe, expect, it } from "vitest";
import {
  MockLlmAdapter,
  MockMemoryProvider,
  MockVictoriaTools,
  VictoriaAgent
} from "../../../src/agent/index.js";
import type { UserHabit } from "../../../src/agent/types.js";

describe("VictoriaAgent", () => {
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
    expect(response.decision.toolCall?.requiresApproval).toBe(true);
    expect(response.message).toContain("$27.46");
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
    expect(approvalResponse.message).toBe("Savings ledger entries require explicit approval.");
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

    const approvalResponse = await agent.approveToolCall(
      {
        userId: "user_123",
        message: "yes save it",
        approvedActionId: "approval_123"
      },
      initialResponse.decision
    );

    expect(approvalResponse.decision.action).toBe("create_ledger_entry");
    expect(approvalResponse.message).toBe("Done. I saved $27.46 in your Victoria ledger.");
  });

  it("asks a follow-up question when avoided spend cannot be estimated", async () => {
    const agent = createAgent();

    const response = await agent.respond({
      userId: "user_123",
      message: "I saved money today."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.message).toContain("What did you avoid spending on");
  });

  it("responds without shame for regretful spending", async () => {
    const agent = createAgent();

    const response = await agent.respond({
      userId: "user_123",
      message: "I regret ordering takeout last night."
    });

    expect(response.decision.action).toBe("reflect");
    expect(response.message).toContain("No shame");
  });
});

function createAgent(habits: UserHabit[] = []): VictoriaAgent {
  return new VictoriaAgent({
    llm: new MockLlmAdapter(),
    memory: new MockMemoryProvider(habits),
    tools: new MockVictoriaTools(habits)
  });
}

