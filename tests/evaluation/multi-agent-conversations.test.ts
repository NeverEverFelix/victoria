import { describe, expect, it, vi } from "vitest";
import {
  createMockAgentTeamSpecialists,
  MockLlmAdapter,
  MockMemoryProvider,
  MockVictoriaTools,
  VictoriaAgent,
  type AgentTeamSpecialists
} from "../../src/agent/index.js";
import type { UserHabit } from "../../src/agent/types.js";

const userId = "multi_agent_eval_user";

describe("multi-agent uncertainty and disagreement conversations", () => {
  it("uses retained context to resolve a low-confidence intent before proposal and approval", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    let firstClassification = true;
    const analyzedMessages: Array<{ message: string; context?: readonly string[] }> = [];
    const specialists: AgentTeamSpecialists = {
      ...base,
      financialMoment: {
        analyze: vi.fn(async (input) => {
          analyzedMessages.push({ message: input.message, context: input.conversationContext });
          if (firstClassification) {
            firstClassification = false;
            return { classification: {
              type: "avoided_spend" as const,
              confidence: 0.55,
              amountCents: 2000,
              summary: input.message,
              needsClarification: false
            } };
          }
          return base.financialMoment.analyze(input);
        })
      }
    };
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools, specialists });
    const context = { userId, conversationId: "uncertain-intent" };

    const uncertain = await agent.respond({ ...context, message: "I almost bought a $20 book, but I'm not sure." });
    expect(uncertain.decision.classification.type).toBe("unclear");
    expect(uncertain.decision.action).toBe("ask_follow_up");
    expect(uncertain.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries(userId)).toEqual([]);

    const clarified = await agent.respond({ ...context, message: "Yes, I did." });
    expect(analyzedMessages[1]?.message).toBe("Yes, I did.");
    expect(analyzedMessages[1]?.context).toContain("I almost bought a $20 book, but I'm not sure.");
    expect(clarified.decision.action).toBe("ask_follow_up");
    expect(clarified.decision.suggestion).toBeUndefined();

    const amount = await agent.respond({ ...context, message: "$20" });
    expect(amount.decision.action).toBe("suggest_savings");
    expect(amount.decision.suggestion?.amountCents).toBe(2000);
    expect(await tools.listSavingsEntries(userId)).toEqual([]);

    const approved = await agent.respond({ ...context, message: "Yes" });
    expect(approved.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(userId)).toMatchObject([{ amountCents: 2000 }]);
  });

  it("resolves specialist and core estimate disagreement from the user's clarification", async () => {
    const habit: UserHabit = {
      id: "blue-bottle-user-habit", userId, merchantName: "Blue Bottle",
      typicalAmountCents: 675, currency: "USD", confidence: 0.9
    };
    const memory = new MockMemoryProvider([habit]);
    const tools = new MockVictoriaTools([{ ...habit, typicalAmountCents: 725 }]);
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools,
      specialists: createMockAgentTeamSpecialists()
    });
    const context = { userId, conversationId: "estimate-disagreement" };

    const disagreement = await agent.respond({
      ...context,
      message: "I made coffee at home instead of going to Blue Bottle."
    });
    expect(disagreement.decision.action).toBe("ask_follow_up");
    expect(disagreement.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries(userId)).toEqual([]);

    const clarified = await agent.respond({ ...context, message: "About $7.25." });
    expect(clarified.decision.action).toBe("suggest_savings");
    expect(clarified.decision.suggestion?.amountCents).toBe(725);
    expect(clarified.decision.savingsEvent?.id).toBe(disagreement.decision.savingsEvent?.id);
    expect(await tools.listSavingsEntries(userId)).toEqual([]);

    const approved = await agent.respond({ ...context, message: "Yes" });
    expect(approved.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(userId)).toMatchObject([{ amountCents: 725 }]);
  });

  it("recovers from a reasoning specialist failure through user-provided amount and approval", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    let failOnce = true;
    const specialists: AgentTeamSpecialists = {
      ...base,
      savingsReasoning: {
        assess: vi.fn(async (input) => {
          if (failOnce) {
            failOnce = false;
            throw new Error("temporary specialist failure");
          }
          return base.savingsReasoning.assess(input);
        })
      }
    };
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools, specialists });
    const context = { userId, conversationId: "reasoning-recovery" };

    const failed = await agent.respond({ ...context, message: "I cooked instead of ordering DoorDash." });
    expect(failed.decision.action).toBe("ask_follow_up");
    expect(failed.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries(userId)).toEqual([]);

    const clarified = await agent.respond({ ...context, message: "About $25." });
    expect(clarified.decision.action).toBe("suggest_savings");
    expect(clarified.decision.suggestion?.amountCents).toBe(2500);
    expect(await tools.listSavingsEntries(userId)).toEqual([]);

    const approved = await agent.respond({ ...context, message: "Yes" });
    expect(approved.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(userId)).toMatchObject([{ amountCents: 2500 }]);
  });

  it("requires a clear proposal revision and fresh approval after low confidence", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const specialists: AgentTeamSpecialists = {
      ...base,
      financialMoment: {
        analyze: vi.fn(async (input) => {
          if (input.message === "I think changing the amount to $25 is what I want.") {
            return { classification: {
              type: "proposal_revision" as const,
              confidence: 0.55,
              amountCents: 2500,
              summary: input.message,
              needsClarification: false
            } };
          }
          return base.financialMoment.analyze(input);
        })
      }
    };
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools, specialists });
    const context = { userId, conversationId: "uncertain-proposal-revision" };

    const original = await agent.respond({ ...context, message: "I almost bought a $20 book but waited." });
    expect(original.decision.action).toBe("suggest_savings");
    const uncertainRevision = await agent.respond({ ...context, message: "I think changing the amount to $25 is what I want." });
    expect(uncertainRevision.decision.action).toBe("ask_follow_up");
    expect(uncertainRevision.decision.classification.uncertainIntent).toBe("proposal_revision");
    expect(uncertainRevision.message).toContain("couldn't confidently understand that revision");
    expect(uncertainRevision.decision.proposal).toMatchObject({
      status: "pending", suggestion: { amountCents: 2000 }
    });
    expect(await tools.listSavingsEntries(userId)).toEqual([]);

    const clearRevision = await agent.respond({ ...context, message: "Change it to $25 instead." });
    expect(clearRevision.decision.action).toBe("suggest_savings");
    expect(clearRevision.decision.proposal).toMatchObject({
      status: "pending", suggestion: { amountCents: 2500 }, supersedesProposalId: original.decision.proposal?.id
    });
    expect(clearRevision.decision.proposalTransitions).toHaveLength(1);
    expect(await tools.listSavingsEntries(userId)).toEqual([]);

    const approved = await agent.respond({ ...context, message: "Yes" });
    expect(approved.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(userId)).toMatchObject([{ amountCents: 2500 }]);
  });

  it("clarifies a low-confidence goal request before proposing or recording an allocation", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const specialists: AgentTeamSpecialists = {
      ...base,
      financialMoment: {
        analyze: vi.fn(async (input) => {
          const finding = await base.financialMoment.analyze(input);
          if (input.message === "Put that toward my emergency fund.") {
            return { classification: { ...finding.classification, confidence: 0.55 } };
          }
          return finding;
        })
      }
    };
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools, specialists });
    const context = { userId, conversationId: "uncertain-goal-request" };

    await agent.respond({ ...context, message: "I almost bought a $45 book but waited." });
    const saved = await agent.respond({ ...context, message: "Yes" });
    expect(saved.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(userId)).toHaveLength(1);

    const uncertainGoal = await agent.respond({ ...context, message: "Put that toward my emergency fund." });
    expect(uncertainGoal.decision.action).toBe("ask_follow_up");
    expect(uncertainGoal.decision.classification.uncertainIntent).toBe("goal_allocation");
    expect(uncertainGoal.message).toContain("Which saved amount and goal");
    expect(uncertainGoal.decision.goalAllocation).toBeUndefined();
    expect(await tools.listSavingsGoalAllocations(userId)).toEqual([]);

    const clarifiedGoal = await agent.respond({ ...context, message: "Emergency fund." });
    expect(clarifiedGoal.decision.action).toBe("update_goal");
    expect(clarifiedGoal.decision.goalAllocation).toMatchObject({ status: "pending", goalName: "Emergency fund" });
    expect(await tools.listSavingsGoalAllocations(userId)).toEqual([]);

    const approved = await agent.respond({ ...context, message: "Yes" });
    expect(approved.decision.action).toBe("record_goal_allocation");
    expect(await tools.listSavingsGoalAllocations(userId)).toMatchObject([{ goalName: "Emergency fund" }]);
  });

  it("uses a newly clarified goal target instead of the uncertain target in retained context", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const specialists: AgentTeamSpecialists = {
      ...base,
      financialMoment: {
        analyze: vi.fn(async (input) => {
          const finding = await base.financialMoment.analyze(input);
          if (input.message === "Put that toward my emergency fund.") {
            return { classification: { ...finding.classification, confidence: 0.55 } };
          }
          return finding;
        })
      }
    };
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools, specialists });
    const context = { userId, conversationId: "clarified-goal-target" };

    await agent.respond({ ...context, message: "I almost bought a $45 book but waited." });
    await agent.respond({ ...context, message: "Yes" });
    const uncertain = await agent.respond({ ...context, message: "Put that toward my emergency fund." });
    expect(uncertain.decision.action).toBe("ask_follow_up");

    const clarified = await agent.respond({ ...context, message: "Travel fund." });
    expect(clarified.decision.action).toBe("update_goal");
    expect(clarified.decision.goalAllocation).toMatchObject({ status: "pending", goalName: "Travel Fund" });
    expect(await tools.listSavingsGoalAllocations(userId)).toEqual([]);

    const approved = await agent.respond({ ...context, message: "Yes" });
    expect(approved.decision.action).toBe("record_goal_allocation");
    expect(await tools.listSavingsGoalAllocations(userId)).toMatchObject([{ goalName: "Travel Fund" }]);
  });
});
