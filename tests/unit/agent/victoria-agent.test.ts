import { afterEach, describe, expect, it, vi } from "vitest";
import {
  createMockAgentTeamSpecialists,
  MockLlmAdapter,
  MockMemoryProvider,
  MockVictoriaTools,
  VictoriaAgent
} from "../../../src/agent/index.js";
import type { AgentTeamSpecialists } from "../../../src/agent/index.js";
import type { UserHabit } from "../../../src/agent/types.js";
import type { SavingsEntry } from "../../../src/domain/savings/types.js";

describe("VictoriaAgent", () => {
  afterEach(() => vi.useRealTimers());

  it("[COR-001] returns frozen financial history snapshots that cannot rewrite an approved proposal or entry", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "immutable_history" };
    const proposed = await agent.respond({
      ...context,
      message: "I almost bought a $27 pastry but decided to wait."
    });
    const proposal = proposed.decision.proposal;
    expect(proposal).toBeDefined();
    if (!proposal) throw new Error("Expected a proposal.");
    expect(Object.isFrozen(proposal)).toBe(true);
    expect(Object.isFrozen(proposed.decision.savingsEvent)).toBe(true);
    expect(Object.isFrozen(proposal.suggestion)).toBe(true);
    expect(Reflect.set(proposal.suggestion, "amountCents", 1)).toBe(false);

    const recorded = await agent.respond({ ...context, message: "Yes" });
    const [entry] = await tools.listSavingsEntries("user_123");
    expect(entry).toBeDefined();
    if (!entry) throw new Error("Expected a ledger entry.");
    expect(Object.isFrozen(entry)).toBe(true);
    expect(Reflect.set(entry, "amountCents", 1)).toBe(false);
    expect(recorded.decision.proposal?.status).toBe("recorded");
    if (recorded.decision.proposal?.status === "recorded") {
      expect(Object.isFrozen(recorded.decision.proposal.approval)).toBe(true);
      expect(Reflect.set(recorded.decision.proposal.approval, "userId", "user_other")).toBe(false);
    }
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([{ amountCents: 2700 }]);
  });

  it("answers weekly progress through a read-only ledger summary tool", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-07T15:00:00.000Z"));
    const tools = new MockVictoriaTools([], [
      savingsEntry({ id: "entry_this_week", userId: "user_123", amountCents: 2750,
        createdAt: "2026-10-05T10:00:00.000Z" }),
      savingsEntry({ id: "entry_prior_week", userId: "user_123", amountCents: 9000,
        createdAt: "2026-10-04T23:59:59.999Z" }),
      savingsEntry({ id: "entry_other_user", userId: "user_other", amountCents: 8000,
        createdAt: "2026-10-06T10:00:00.000Z" })
    ]);
    const agent = createAgent([], tools);

    const response = await agent.respond({
      userId: "user_123",
      message: "How much have I saved this week?"
    });

    expect(response.decision.action).toBe("summarize_progress");
    expect(response.decision.toolCall).toMatchObject({
      name: "getWeeklySavingsTotal",
      requiresApproval: false
    });
    expect(response.message).toContain("$27.50");
    expect(response.message).toContain("mocked Victoria savings ledger");
    expect(response.message).toContain("No real money has moved");
  });

  it("[COR-003] [COR-005] appends an approved correction and keeps the recorded entry unchanged", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-10-06T12:00:00.000Z"));
    const tools = new MockVictoriaTools([], [savingsEntry({
      id: "entry_original", userId: "user_123", amountCents: 2700,
      createdAt: "2026-09-30T12:00:00.000Z"
    })]);
    const corrected = await tools.createSavingsEntryCorrection({
      userId: "user_123", savingsEntryId: "entry_original", correctedAmountCents: 2400,
      reason: "The original estimate was too high.", approvalId: "approval_correction_1",
      approvedActionId: "correction_action_1"
    });
    expect(corrected).toMatchObject({
      savingsEntryId: "entry_original", correctedAmountCents: 2400, adjustmentCents: -300
    });
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([{ id: "entry_original", amountCents: 2700 }]);
    expect(await tools.listSavingsEntryCorrections("user_123")).toEqual([corrected]);
    expect(await tools.createSavingsEntryCorrection({
      userId: "user_123", savingsEntryId: "entry_original", correctedAmountCents: 2400,
      reason: "The original estimate was too high.", approvalId: "approval_correction_1", approvedActionId: "correction_action_1"
    })).toEqual(corrected);
    expect(await tools.getWeeklySavingsTotal("user_123", new Date("2026-10-01T12:00:00.000Z"))).toBe(2400);
    expect(await tools.getWeeklySavingsTotal("user_123", new Date("2026-10-06T12:00:00.000Z"))).toBe(0);
  });

  it("rejects no-op corrections, invalid amounts, and corrections to another user's entry", async () => {
    const tools = new MockVictoriaTools([], [savingsEntry({
      id: "entry_original", userId: "user_123", amountCents: 2700, createdAt: new Date().toISOString()
    })]);
    const correction = {
      userId: "user_123", savingsEntryId: "entry_original", correctedAmountCents: 2400,
      reason: "Correction", approvalId: "approval_1", approvedActionId: "action_1"
    };
    await expect(tools.createSavingsEntryCorrection({ ...correction, correctedAmountCents: 0 })).rejects.toThrow("positive safe integer");
    await expect(tools.createSavingsEntryCorrection({ ...correction, correctedAmountCents: Number.MAX_SAFE_INTEGER + 1 })).rejects.toThrow("positive safe integer");
    await expect(tools.createSavingsEntryCorrection({ ...correction, userId: "user_other" })).rejects.toThrow("owned by the user");
    await tools.createSavingsEntryCorrection(correction);
    await expect(tools.createSavingsEntryCorrection({ ...correction, approvedActionId: "action_2" })).rejects.toThrow("non-zero");
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([{ amountCents: 2700 }]);
    expect(await tools.listSavingsEntryCorrections("user_123")).toHaveLength(1);
  });

  it("does not record an ambiguous or declined correction", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "declined_correction" };
    await agent.respond({ ...context, message: "I almost bought a $27 pastry but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    await agent.respond({ ...context, message: "Correct that recorded entry to $24." });
    const ambiguous = await agent.respond({ ...context, message: "Maybe" });
    expect(ambiguous.decision.action).toBe("ask_follow_up");
    expect(await tools.listSavingsEntryCorrections("user_123")).toEqual([]);
    const declined = await agent.respond({ ...context, message: "No" });
    expect(declined.decision.action).toBe("reflect");
    expect(await tools.listSavingsEntryCorrections("user_123")).toEqual([]);
    expect((await tools.listSavingsEntries("user_123"))[0]?.amountCents).toBe(2700);
  });

  it("[COR-003] [COR-004] requires exact approval before correcting a just-recorded entry in the conversation", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "entry_correction" };
    await agent.respond({ ...context, message: "I almost bought a $27 pastry but decided to wait." });
    const recorded = await agent.respond({ ...context, message: "Yes" });
    const original = (await tools.listSavingsEntries("user_123"))[0];
    expect(recorded.decision.action).toBe("create_ledger_entry");
    const correctionProposal = await agent.respond({ ...context, message: "Correct that recorded entry to $24." });
    expect(correctionProposal.decision.action).toBe("correct_ledger_entry");
    expect(correctionProposal.decision.toolCall?.requiresApproval).toBe(true);
    expect(correctionProposal.message).toContain("most recently recorded entry in this conversation is currently $27.00");
    expect(correctionProposal.message).toContain("original entry will stay in the history");
    expect(await tools.listSavingsEntryCorrections("user_123")).toEqual([]);
    const unboundApproval = await agent.approveToolCall({ ...context, message: "Yes" }, correctionProposal.decision);
    expect(unboundApproval.decision.action).toBe("refuse");
    expect(await tools.listSavingsEntryCorrections("user_123")).toEqual([]);
    const corrected = await agent.respond({ ...context, message: "Yes" });
    expect(corrected.decision.action).toBe("correct_ledger_entry");
    expect(corrected.message).toContain("corrected the recorded amount to $24.00");
    expect(await tools.listSavingsEntries("user_123")).toEqual([original]);
    expect(await tools.listSavingsEntryCorrections("user_123")).toMatchObject([
      { savingsEntryId: original?.id, correctedAmountCents: 2400, adjustmentCents: -300 }
    ]);
    expect(await tools.getWeeklySavingsTotal("user_123")).toBe(2400);
  });

  it("[COR-005] allocates a corrected entry using its current effective amount", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "correct_then_allocate" };
    await agent.respond({ ...context, message: "I almost bought a $27 pastry but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    await agent.respond({ ...context, message: "Correct that recorded entry to $24." });
    const correction = await agent.respond({ ...context, message: "Yes" });
    expect(correction.decision.entryCorrection?.correctedAmountCents).toBe(2400);

    const proposal = await agent.respond({ ...context, message: "Put that toward my emergency fund." });
    expect(proposal.decision.goalAllocation).toMatchObject({
      status: "pending",
      amountCents: 2400,
      goalName: "Emergency fund"
    });
    expect(proposal.message).toContain("$24.00");

    const recorded = await agent.respond({ ...context, message: "Yes" });
    expect(recorded.decision.goalAllocation).toMatchObject({
      status: "recorded",
      amountCents: 2400,
      goalName: "Emergency fund"
    });
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([{ amountCents: 2700 }]);
    expect(await tools.getEffectiveSavingsEntryAmount("user_123", "entry_1")).toBe(2400);
    expect(await tools.getWeeklySavingsTotal("user_123")).toBe(2400);
  });

  it("requires fresh approval if an entry changes after the goal proposal", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "stale_goal_amount" };
    await agent.respond({ ...context, message: "I almost bought a $27 pastry but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    const proposal = await agent.respond({ ...context, message: "Put that toward my emergency fund." });
    const [entry] = await tools.listSavingsEntries("user_123");
    expect(entry).toBeDefined();
    if (!entry) throw new Error("Expected the recent entry to exist.");

    await tools.createSavingsEntryCorrection({
      userId: "user_123",
      savingsEntryId: entry.id,
      correctedAmountCents: 2400,
      reason: "Updated amount",
      approvalId: "approval_external_correction",
      approvedActionId: "action_external_correction"
    });
    const refreshed = await agent.respond({ ...context, message: "Yes" });

    expect(refreshed.decision.action).toBe("update_goal");
    expect(refreshed.decision.goalAllocation).toMatchObject({ status: "pending", amountCents: 2400 });
    expect(refreshed.message).toContain("please confirm again");
    expect(refreshed.decision.toolCall?.actionId).not.toBe(proposal.decision.toolCall?.actionId);
    expect(await tools.listSavingsGoalAllocations("user_123")).toEqual([]);

    const recorded = await agent.respond({ ...context, message: "Yes" });
    expect(recorded.decision.goalAllocation).toMatchObject({ status: "recorded", amountCents: 2400 });
    expect(await tools.listSavingsGoalAllocations("user_123")).toHaveLength(1);
  });

  it("[IDM-002] retries an uncertain correction with the same approval", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "correction_retry" };
    await agent.respond({ ...context, message: "I almost bought a $27 pastry but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    await agent.respond({ ...context, message: "Correct that recorded entry to $24." });
    const createCorrection = tools.createSavingsEntryCorrection.bind(tools);
    const writeSpy = vi.spyOn(tools, "createSavingsEntryCorrection").mockImplementationOnce(async (input) => {
      await createCorrection(input);
      throw new Error("Response lost after persistence.");
    });

    const uncertain = await agent.respond({ ...context, message: "Yes" });
    expect(uncertain.decision.action).toBe("ask_follow_up");
    expect(await tools.listSavingsEntryCorrections("user_123")).toHaveLength(1);
    const retried = await agent.respond({ ...context, message: "Yes" });

    expect(retried.decision.action).toBe("correct_ledger_entry");
    expect(writeSpy.mock.calls).toHaveLength(2);
    expect(writeSpy.mock.calls[1]?.[0].approvalId).toBe(writeSpy.mock.calls[0]?.[0].approvalId);
    expect(await tools.listSavingsEntryCorrections("user_123")).toHaveLength(1);
    expect((await tools.listSavingsEntries("user_123"))[0]?.amountCents).toBe(2700);
    const [correction] = await tools.listSavingsEntryCorrections("user_123");
    expect(correction && Object.isFrozen(correction)).toBe(true);
    if (correction) expect(Reflect.set(correction, "adjustmentCents", 1)).toBe(false);
  });

  it("[COR-002] uses updated spending evidence for future suggestions without changing a pending one", async () => {
    const habits: UserHabit[] = [
      { userId: "user_123", id: "habit_7th_street", merchantName: "7th Street", typicalAmountCents: 2746, currency: "USD", confidence: 0.9 }
    ];
    const tools = new MockVictoriaTools(habits);
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(),
      memory: new MockMemoryProvider(habits),
      tools
    });
    const firstContext = { userId: "user_123", conversationId: "evolving_habit" };
    const firstSuggestion = await agent.respond({
      ...firstContext,
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    expect(firstSuggestion.decision.suggestion?.amountCents).toBe(2746);

    habits[0] = { ...habits[0]!, typicalAmountCents: 3100 };
    const confirmation = await agent.respond({ ...firstContext, message: "Yes" });
    expect(confirmation.decision.proposal?.suggestion.amountCents).toBe(2746);
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([{ amountCents: 2746 }]);

    const nextSuggestion = await agent.respond({
      userId: "user_123",
      conversationId: "evolving_habit_next",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    expect(nextSuggestion.decision.suggestion?.amountCents).toBe(3100);
    expect(nextSuggestion.decision.proposal?.suggestion.amountCents).toBe(3100);
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([{ amountCents: 2746 }]);
  });

  it("[MEM-001] keeps habits, goals, and remembered decisions scoped to their user", async () => {
    const habits: UserHabit[] = [
      { userId: "user_123", id: "habit_user_123", merchantName: "7th Street", typicalAmountCents: 2746, currency: "USD", confidence: 0.9 },
      { userId: "user_other", id: "habit_user_other", merchantName: "7th Street", typicalAmountCents: 1200, currency: "USD", confidence: 0.8 }
    ];
    const goals = [
      { userId: "user_123", id: "goal_123", name: "Emergency fund", savedAmountCents: 0, currency: "USD" as const },
      { userId: "user_other", id: "goal_other", name: "Trip", savedAmountCents: 0, currency: "USD" as const }
    ];
    const memory = new MockMemoryProvider(habits, goals);
    await memory.rememberDecision("user_123", { type: "avoided_spend", summary: "Made coffee at home." });

    expect(await memory.listHabits("user_123")).toMatchObject([{ id: "habit_user_123" }]);
    expect(await memory.listHabits("user_other")).toMatchObject([{ id: "habit_user_other" }]);
    expect(await memory.listGoals("user_123")).toMatchObject([{ id: "goal_123" }]);
    expect(await memory.listGoals("user_other")).toMatchObject([{ id: "goal_other" }]);
    expect((await memory.getMemoryForUser("user_other")).recentDecisions).toEqual([]);

    const tools = new MockVictoriaTools(habits);
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });
    const response = await agent.respond({
      userId: "user_other",
      message: "I cooked instead of DoorDashing my usual 7th Street order."
    });
    expect(response.decision.suggestion?.amountCents).toBe(1200);
    expect(response.message).toContain("$12.00");
  });

  it("asks for the target entry when a correction has no conversation context", async () => {
    const agent = createAgent();
    const response = await agent.respond({ userId: "user_123", message: "Correct that recorded entry to $24." });
    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.toolCall).toBeUndefined();
    expect(response.message).toContain("Which recorded savings entry");
  });

  it("[ARC-001] turns malformed classifier amounts into clarification without a tool call", async () => {
    const malformedLlm = {
      classifyMessage: async () => ({
        type: "avoided_spend", confidence: 0.9, amountCents: Number.NaN,
        summary: "User avoided spending", needsClarification: false, approved: true
      }),
      draftResponse: async () => ""
    } as unknown as ConstructorParameters<typeof VictoriaAgent>[0]["llm"];
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: malformedLlm, memory: new MockMemoryProvider(), tools });
    const response = await agent.respond({ userId: "user_123", message: "I skipped a purchase." });
    expect(response.decision.classification.type).toBe("unclear");
    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.proposal).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[ARC-001] ignores untyped approval fields returned by the classifier", async () => {
    const llm = {
      classifyMessage: async () => ({
        type: "avoided_spend", confidence: 0.9, amountCents: 9000,
        summary: "A jacket purchase was avoided", needsClarification: false, approved: true
      }),
      draftResponse: async () => ""
    } as unknown as ConstructorParameters<typeof VictoriaAgent>[0]["llm"];
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm, memory: new MockMemoryProvider(), tools });
    const response = await agent.respond({ userId: "user_123", message: "I waited on the jacket." });
    expect(response.decision.action).toBe("suggest_savings");
    expect(response.decision.toolCall?.requiresApproval).toBe(true);
    expect(response.decision.classification).not.toHaveProperty("approved");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[ARC-002] does not propose an unsafe amount returned by an estimator", async () => {
    const tools = new MockVictoriaTools([{
      userId: "user_123", id: "bad_habit", merchantName: "Blue Bottle", typicalAmountCents: Number.MAX_SAFE_INTEGER + 1,
      currency: "USD", confidence: 0.9
    }]);
    const agent = createAgent([], tools);
    const response = await agent.respond({ userId: "user_123", message: "I made coffee at home instead of Blue Bottle." });
    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("plainly reports when no completed savings are recorded this week", async () => {
    const agent = createAgent();

    const response = await agent.respond({
      userId: "user_123",
      message: "How much have I saved this week?"
    });

    expect(response.decision.action).toBe("summarize_progress");
    expect(response.message).toContain("No savings have been recorded");
    expect(response.message).toContain("mocked Victoria savings ledger");
    expect(response.message).toContain("No real money has moved");
  });

  it("does not mistake a future savings intention for a progress question", async () => {
    const tools = new MockVictoriaTools();
    const weeklyTotal = vi.spyOn(tools, "getWeeklySavingsTotal");
    const agent = createAgent([], tools);

    const response = await agent.respond({
      userId: "user_123",
      message: "I plan to save more this week."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.classification.type).toBe("unclear");
    expect(weeklyTotal).not.toHaveBeenCalled();
  });

  it("reports a weekly progress lookup failure without crashing", async () => {
    const tools = new MockVictoriaTools();
    vi.spyOn(tools, "getWeeklySavingsTotal").mockRejectedValueOnce(
      new Error("Ledger summary unavailable.")
    );
    const agent = createAgent([], tools);

    const response = await agent.respond({
      userId: "user_123",
      message: "How much have I saved this week?"
    });

    expect(response.decision.action).toBe("summarize_progress");
    expect(response.message).toContain("couldn't load your weekly total");
  });

  it("[FIN-001] refuses a natural-language request to move money", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);

    const response = await agent.respond({
      userId: "user_123",
      message: "Move the money now."
    });

    expect(response.decision.action).toBe("refuse");
    expect(response.decision.classification.type).toBe("real_money_movement_request");
    expect(response.message).toContain("can't move real money");
    expect(response.message).toContain("mocked Victoria savings ledger");
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[AMT-004] asks to clarify an avoided-spend amount with excess precision", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);

    const response = await agent.respond({
      userId: "user_123",
      message: "I almost bought a $6.755 pastry but decided to wait."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(response.message).toContain("more than two decimal places");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[AMT-005] asks for USD instead of converting an unsupported currency", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);

    const response = await agent.respond({
      userId: "user_123",
      message: "I almost bought a €20 pastry but decided to wait."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(response.message).toContain("USD amounts");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[AMT-002] clarifies zero and negative avoided-spend amounts without proposing savings", async () => {
    for (const amount of ["$0", "$0.00", "-$5", "$-5"]) {
      const tools = new MockVictoriaTools();
      const agent = createAgent([], tools);
      const response = await agent.respond({
        userId: "user_123",
        message: `I almost bought a pastry for ${amount} but decided to wait.`
      });

      expect(response.decision.action).toBe("ask_follow_up");
      expect(response.decision.suggestion).toBeUndefined();
      expect(response.decision.proposal).toBeUndefined();
      expect(response.decision.toolCall).toBeUndefined();
      expect(response.message).toContain("positive amount");
      expect(await tools.listSavingsEntries("user_123")).toEqual([]);
    }
  });

  it("[AMT-002] asks which amount to use when an avoided-spend message names two amounts", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const response = await agent.respond({
      userId: "user_123",
      message: "I almost bought a pastry for $6 or $8 but decided to wait."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(response.message).toContain("Which single amount in USD");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[AMT-002] requires an unambiguous revision before pending savings can be approved", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "multi_amount_revision" };
    const original = await agent.respond({
      ...context,
      message: "I almost bought a $20 pastry but decided to wait."
    });

    const ambiguousRevision = await agent.respond({
      ...context,
      message: "Actually, make that $6 or $8."
    });
    expect(ambiguousRevision.decision.action).toBe("ask_follow_up");
    expect(ambiguousRevision.message).toContain("haven't changed the pending suggestion");

    const approvalBeforeClarification = await agent.respond({ ...context, message: "Yes" });
    expect(approvalBeforeClarification.decision.action).toBe("ask_follow_up");
    expect(approvalBeforeClarification.message).toContain("unambiguous amount");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const clarified = await agent.respond({ ...context, message: "Use $8." });
    expect(clarified.decision.proposal?.supersedesProposalId).toBe(original.decision.proposal?.id);
    expect(clarified.decision.suggestion?.amountCents).toBe(800);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("does not approve the original amount when a pending amount correction is invalid", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "invalid_pending_amount" };
    await agent.respond({ ...context, message: "I almost bought a $20 pastry but decided to wait." });

    const correction = await agent.respond({ ...context, message: "Actually, make that $6.755." });

    expect(correction.decision.action).toBe("ask_follow_up");
    expect(correction.message).toContain("haven't changed the pending suggestion");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const attemptedApproval = await agent.respond({ ...context, message: "Yes" });
    expect(attemptedApproval.decision.action).toBe("ask_follow_up");
    expect(attemptedApproval.message).toContain("valid USD amount");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const corrected = await agent.respond({ ...context, message: "It was $6.75." });
    expect(corrected.decision.action).toBe("suggest_savings");
    expect(corrected.decision.proposal?.supersedesProposalId).toBe(
      correction.decision.proposal?.id
    );
    expect(corrected.decision.suggestion?.amountCents).toBe(675);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[FIN-001] does not treat a transfer request as approval for a pending mocked entry", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "transfer_conversation" };

    await agent.respond({
      ...context,
      message: "I almost bought a $45 book but decided to wait."
    });
    const response = await agent.respond({ ...context, message: "Move the money now." });

    expect(response.decision.action).toBe("refuse");
    expect(response.message).toContain("can't move real money");
    expect(response.message).toContain("$45.00");
    expect(response.message).toContain("after you confirm");
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("[APR-003] binds a goal allocation to a fresh approval before recording it", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "goal_conversation" };
    const suggestion = await agent.respond({
      ...context,
      message: "I almost bought a $45 book but decided to wait."
    });
    const oldActionId = requireActionId(suggestion.decision.toolCall?.actionId);
    const originalProposalId = suggestion.decision.proposal?.id;

    const allocation = await agent.respond({
      ...context,
      message: "Put this toward my emergency fund."
    });

    const updatedActionId = requireActionId(allocation.decision.toolCall?.actionId);
    expect(updatedActionId).not.toBe(oldActionId);
    expect(allocation.decision.action).toBe("update_goal");
    expect(allocation.decision.proposal?.id).not.toBe(originalProposalId);
    expect(allocation.decision.proposal).toMatchObject({
      supersedesProposalId: originalProposalId,
      status: "pending",
      goalName: "Emergency fund"
    });
    expect(allocation.decision.toolCall?.arguments).toMatchObject({ goalName: "Emergency fund" });
    expect(allocation.message).toContain("$45.00");
    expect(allocation.message).toContain("Emergency fund");
    expect(allocation.message).toContain("confirm");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const confirmation = await agent.respond({ ...context, message: "Yes" });

    expect(confirmation.decision.action).toBe("create_ledger_entry");
    expect(confirmation.decision.proposal).toMatchObject({
      status: "recorded",
      goalName: "Emergency fund",
      approval: { actionId: updatedActionId }
    });
    expect(confirmation.message).toContain("Emergency fund");
    expect(confirmation.message).toContain("No real money has moved");
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([
      { amountCents: 4500, goalName: "Emergency fund", movementMode: "mock_ledger" }
    ]);

    const staleApproval = await agent.approveToolCall(
      { ...context, message: "Yes", approvedActionId: oldActionId },
      suggestion.decision
    );
    expect(staleApproval.decision.action).toBe("refuse");
  });

  it("[APR-005] replaces a pending proposal when the user corrects its amount", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "amount_revision" };
    const original = await agent.respond({
      ...context,
      message: "I almost bought a $90 jacket but decided to wait."
    });
    const originalActionId = requireActionId(original.decision.toolCall?.actionId);
    const originalProposalId = original.decision.proposal?.id;

    const revision = await agent.respond({
      ...context,
      message: "Actually, make that $75 instead."
    });

    const revisedActionId = requireActionId(revision.decision.toolCall?.actionId);
    expect(revision.decision.action).toBe("suggest_savings");
    expect(revision.decision.proposal?.id).not.toBe(originalProposalId);
    expect(revision.decision.proposal?.supersedesProposalId).toBe(originalProposalId);
    expect(revision.decision.proposal?.actionId).toBe(revisedActionId);
    expect(revision.decision.proposalTransitions?.at(-1)).toMatchObject({
      proposalId: originalProposalId, actionId: originalActionId, to: "superseded",
      supersededByProposalId: revision.decision.proposal?.id
    });
    expect(revision.decision.suggestion).toMatchObject({
      amountCents: 7500,
      source: "user_provided"
    });
    expect(revisedActionId).not.toBe(originalActionId);
    expect(original.decision.proposal?.status).toBe("pending");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const oldApproval = await agent.approveToolCall(
      { ...context, message: "Yes", approvedActionId: originalActionId },
      original.decision
    );
    expect(oldApproval.decision.action).toBe("refuse");

    const confirmation = await agent.respond({ ...context, message: "Yes" });
    expect(confirmation.decision.proposal).toMatchObject({
      status: "recorded",
      approval: { actionId: revisedActionId }
    });
    expect(confirmation.decision.proposalTransitions?.at(-1)).toMatchObject({
      to: "recorded", proposalId: revision.decision.proposal?.id, actionId: revisedActionId
    });
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([
      { amountCents: 7500, movementMode: "mock_ledger" }
    ]);
  });

  it("[APR-005] replaces a pending proposal when the user changes its reason", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "reason_revision" };
    const original = await agent.respond({
      ...context,
      message: "I almost bought a $90 jacket but decided to wait."
    });
    const originalProposalId = original.decision.proposal?.id;
    const originalActionId = requireActionId(original.decision.toolCall?.actionId);

    const revision = await agent.respond({
      ...context,
      message: "Change the reason to I waited until payday."
    });

    const revisedActionId = requireActionId(revision.decision.toolCall?.actionId);
    expect(revision.decision.proposal?.id).not.toBe(originalProposalId);
    expect(revision.decision.proposal?.supersedesProposalId).toBe(originalProposalId);
    expect(revision.decision.suggestion?.reason).toBe("I waited until payday.");
    expect(revisedActionId).not.toBe(originalActionId);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const confirmation = await agent.respond({ ...context, message: "Yes" });
    expect(confirmation.decision.proposal).toMatchObject({
      status: "recorded",
      approval: { actionId: revisedActionId }
    });
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([
      { amountCents: 9000, reason: "I waited until payday." }
    ]);
  });

  it("[APR-005] keeps unsupported currency revisions from changing the pending payload", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "currency_revision" };
    const original = await agent.respond({
      ...context,
      message: "I almost bought a $90 jacket but decided to wait."
    });
    const originalActionId = requireActionId(original.decision.toolCall?.actionId);
    const originalProposalId = original.decision.proposal?.id;

    const revision = await agent.respond({ ...context, message: "Change the currency to EUR." });

    expect(revision.decision.action).toBe("ask_follow_up");
    expect(revision.message).toContain("only revise the amount or reason");
    expect(revision.decision.proposal?.id).toBe(originalProposalId);
    expect(revision.decision.toolCall?.actionId).toBe(originalActionId);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const confirmation = await agent.respond({ ...context, message: "Yes" });
    expect(confirmation.decision.proposal).toMatchObject({
      status: "recorded",
      suggestion: { amountCents: 9000, currency: "USD", movementMode: "mock_ledger" }
    });
  });

  it("asks which saved amount a goal request refers to when there is no pending suggestion", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);

    const response = await agent.respond({
      userId: "user_123",
      message: "Put this toward my emergency fund."
    });

    expect(response.decision.action).toBe("update_goal");
    expect(response.message).toContain("Which saved amount");
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("does not reuse an older confirmed entry after a newer suggestion is declined", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "recent_entry_context" };

    await agent.respond({ ...context, message: "I almost bought a $20 item but decided not to." });
    await agent.respond({ ...context, message: "Yes" });
    await agent.respond({ ...context, message: "I almost bought a $45 item but decided not to." });
    await agent.respond({ ...context, message: "Not today." });

    const response = await agent.respond({
      ...context,
      message: "Put this toward my emergency fund."
    });

    expect(response.decision.action).toBe("update_goal");
    expect(response.message).toContain("Which saved amount");
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsGoalAllocations("user_123")).toEqual([]);
    expect(await tools.listSavingsEntries("user_123")).toHaveLength(1);
  });

  it("[APR-007] records a confirmed-entry goal allocation as linked history", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "confirmed_goal_conversation" };

    await agent.respond({
      ...context,
      message: "I almost bought a $45 book but decided to wait."
    });
    await agent.respond({ ...context, message: "Yes" });
    const [originalEntry] = await tools.listSavingsEntries("user_123");
    expect(originalEntry).toBeDefined();

    const proposal = await agent.respond({
      ...context,
      message: "Put that toward my emergency fund."
    });

    const actionId = requireActionId(proposal.decision.toolCall?.actionId);
    expect(proposal.decision.action).toBe("update_goal");
    expect(proposal.decision.goalAllocation).toMatchObject({
      status: "pending",
      savingsEntryId: originalEntry?.id,
      amountCents: 4500,
      goalName: "Emergency fund"
    });
    expect(proposal.decision.toolCall).toMatchObject({
      name: "createSavingsGoalAllocation",
      requiresApproval: true,
      arguments: {
        savingsEntryId: originalEntry?.id,
        amountCents: 4500,
        goalName: "Emergency fund"
      }
    });
    expect(await tools.listSavingsGoalAllocations("user_123")).toEqual([]);
    expect(await tools.listSavingsEntries("user_123")).toEqual([originalEntry]);

    const wrongUserApproval = await agent.approveToolCall(
      { userId: "user_other", message: "Yes", approvedActionId: actionId },
      proposal.decision
    );
    expect(wrongUserApproval.decision.action).toBe("refuse");
    expect(await tools.listSavingsGoalAllocations("user_123")).toEqual([]);

    const unclearConfirmation = await agent.respond({ ...context, message: "Maybe." });
    expect(unclearConfirmation.decision.action).toBe("ask_follow_up");
    expect(unclearConfirmation.message).toContain("clear yes or no");
    expect(await tools.listSavingsGoalAllocations("user_123")).toEqual([]);

    const confirmation = await agent.respond({ ...context, message: "Yes" });

    expect(confirmation.decision.action).toBe("record_goal_allocation");
    expect(confirmation.decision.goalAllocation).toMatchObject({
      status: "recorded",
      savingsEntryId: originalEntry?.id,
      amountCents: 4500,
      goalName: "Emergency fund",
      approval: { actionId }
    });
    expect(confirmation.message).toContain("$45.00");
    expect(confirmation.message).toContain("Emergency fund");
    expect(confirmation.message).toContain("No real money has moved");
    expect(await tools.listSavingsEntries("user_123")).toEqual([originalEntry]);
    const allocations = await tools.listSavingsGoalAllocations("user_123");
    expect(allocations).toMatchObject([
      {
        savingsEntryId: originalEntry?.id,
        amountCents: 4500,
        goalName: "Emergency fund",
        approvedActionId: actionId
      }
    ]);
    const [recordedAllocation] = allocations;
    expect(recordedAllocation).toBeDefined();
    if (!recordedAllocation) throw new Error("Expected the goal allocation to be recorded.");

    const retriedAllocation = await tools.createSavingsGoalAllocation({
      userId: "user_123",
      savingsEntryId: recordedAllocation.savingsEntryId,
      amountCents: recordedAllocation.amountCents,
      goalName: recordedAllocation.goalName,
      approval: recordedAllocation.approval,
      approvedActionId: recordedAllocation.approvedActionId
    });

    expect(retriedAllocation).toEqual(recordedAllocation);
    await expect(tools.createSavingsGoalAllocation({
      userId: "user_123",
      savingsEntryId: recordedAllocation.savingsEntryId,
      amountCents: recordedAllocation.amountCents,
      goalName: "Vacation",
      approval: recordedAllocation.approval,
      approvedActionId: recordedAllocation.approvedActionId
    })).rejects.toThrow("An approved action cannot be reused for a different goal allocation.");
    expect(await tools.listSavingsGoalAllocations("user_123")).toEqual([recordedAllocation]);
    const replay = await agent.respond({ ...context, message: "Yes" });
    expect(replay.decision.action).not.toBe("record_goal_allocation");
    expect(await tools.listSavingsGoalAllocations("user_123")).toHaveLength(allocations.length);

    const replayedApproval = await agent.approveToolCall(
      { ...context, message: "Yes", approvedActionId: actionId },
      proposal.decision
    );
    expect(replayedApproval.decision.action).toBe("refuse");
    expect(await tools.listSavingsGoalAllocations("user_123")).toHaveLength(allocations.length);
  });

  it("[IDM-002] retries an uncertain goal allocation with the same approval", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "goal_allocation_retry" };
    await agent.respond({ ...context, message: "I almost bought a $45 book but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    await agent.respond({ ...context, message: "Put that toward my emergency fund." });
    const createAllocation = tools.createSavingsGoalAllocation.bind(tools);
    const writeSpy = vi.spyOn(tools, "createSavingsGoalAllocation").mockImplementationOnce(async (input) => {
      await createAllocation(input);
      throw new Error("Response lost after persistence.");
    });

    const uncertain = await agent.respond({ ...context, message: "Yes" });
    expect(uncertain.decision.action).toBe("ask_follow_up");
    expect(await tools.listSavingsGoalAllocations("user_123")).toHaveLength(1);
    const retried = await agent.respond({ ...context, message: "Yes" });

    expect(retried.decision.action).toBe("record_goal_allocation");
    expect(writeSpy.mock.calls).toHaveLength(2);
    expect(writeSpy.mock.calls[1]?.[0].approval.id).toBe(writeSpy.mock.calls[0]?.[0].approval.id);
    expect(await tools.listSavingsGoalAllocations("user_123")).toHaveLength(1);
    const [allocation] = await tools.listSavingsGoalAllocations("user_123");
    expect(allocation && Object.isFrozen(allocation)).toBe(true);
    if (allocation) expect(Object.isFrozen(allocation.approval)).toBe(true);
  });

  it("retries a goal allocation after the tool commits but its response is lost", async () => {
    const tools = new MockVictoriaTools();
    const createAllocation = tools.createSavingsGoalAllocation.bind(tools);
    vi.spyOn(tools, "createSavingsGoalAllocation").mockImplementationOnce(async (input) => {
      await createAllocation(input);
      throw new Error("Response lost after commit.");
    });
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "goal_retry" };

    await agent.respond({ ...context, message: "I almost bought a $45 book but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    await agent.respond({ ...context, message: "Put that toward my emergency fund." });

    const retryPrompt = await agent.respond({ ...context, message: "Yes" });
    expect(retryPrompt.decision.action).toBe("ask_follow_up");
    expect(await tools.listSavingsGoalAllocations("user_123")).toHaveLength(1);

    const recovered = await agent.respond({ ...context, message: "Yes" });
    expect(recovered.decision.action).toBe("record_goal_allocation");
    expect(await tools.listSavingsGoalAllocations("user_123")).toHaveLength(1);
  });

  it("clears a declined goal allocation without recording it", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const context = { userId: "user_123", conversationId: "goal_decline" };

    await agent.respond({ ...context, message: "I almost bought a $45 book but decided to wait." });
    await agent.respond({ ...context, message: "Yes" });
    await agent.respond({ ...context, message: "Put that toward my emergency fund." });

    const declined = await agent.respond({ ...context, message: "No, not today." });
    expect(declined.decision.action).toBe("reflect");
    expect(await tools.listSavingsGoalAllocations("user_123")).toEqual([]);

    const laterApproval = await agent.respond({ ...context, message: "Yes" });
    expect(laterApproval.decision.action).not.toBe("record_goal_allocation");
    expect(await tools.listSavingsGoalAllocations("user_123")).toEqual([]);
  });

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
    expect(Date.parse(suggestion.decision.savingsEvent?.createdAt ?? "")).not.toBeNaN();
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
    expect(Date.parse(suggestion.decision.proposal?.createdAt ?? "")).not.toBeNaN();
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
    expect(Date.parse(confirmation.decision.proposal?.status === "recorded"
      ? confirmation.decision.proposal.approval.approvedAt
      : "")).not.toBeNaN();
    expect(confirmation.message).toBe(
      "Done. I recorded $90.00 in your Victoria savings ledger. Your total in the mocked Victoria savings ledger this week is $90.00. No real money has moved yet."
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

  it.each(["Okay", "Sure", "Sounds good"])(
    "[APR-008] asks for clear approval after the ambiguous reply %s",
    async (message) => {
      const tools = new MockVictoriaTools();
      const agent = createAgent([], tools);
      const context = { userId: "user_123", conversationId: "conversation_123" };

      await agent.respond({
        ...context,
        message: "I almost bought a $90 jacket but decided to wait."
      });
      const response = await agent.respond({ ...context, message });

      expect(response.decision.action).toBe("ask_follow_up");
      expect(response.message).toContain("clear yes or no");
      expect(await tools.listSavingsEntries("user_123")).toEqual([]);
    }
  );

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
    expect(response.decision.proposalTransitions?.at(-1)).toMatchObject({
      proposalId: suggestion.decision.proposal?.id,
      actionId: suggestion.decision.proposal?.actionId,
      from: "pending", to: "declined"
    });
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
        userId: "user_123",
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

  it("[AUD-001] prefers a user-provided amount over merchant history when both are present", async () => {
    const tools = new MockVictoriaTools([
      {
        id: "habit_doordash",
        merchantName: "DoorDash",
        userId: "user_123",
        typicalAmountCents: 2746,
        currency: "USD",
        confidence: 0.9
      }
    ]);
    const agent = createAgent(
      [
        {
          id: "habit_doordash",
          merchantName: "DoorDash",
          userId: "user_123",
          typicalAmountCents: 2746,
          currency: "USD",
          confidence: 0.9
        }
      ],
      tools
    );

    const response = await agent.respond({
      userId: "user_123",
      message: "I almost ordered $31.50 from DoorDash but cooked instead."
    });

    expect(response.decision.action).toBe("suggest_savings");
    expect(response.decision.savingsEvent).toMatchObject({
      merchantName: "DoorDash",
      userProvidedAmountCents: 3150
    });
    expect(response.decision.suggestion).toMatchObject({
      amountCents: 3150,
      source: "user_provided"
    });
    expect(response.message).toContain("$31.50");
    expect(response.message).toContain("amount you provided");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("refuses to create a savings ledger entry without approval", async () => {
    const agent = createAgent([
      {
        id: "habit_7th_street",
        merchantName: "7th Street",
        userId: "user_123",
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
        userId: "user_123",
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
      "Done. I recorded $27.46 in your Victoria savings ledger. Your total in the mocked Victoria savings ledger this week is $27.46. No real money has moved yet."
    );
  });

  it("still confirms a recorded entry if the weekly progress lookup fails", async () => {
    const tools = new MockVictoriaTools();
    vi.spyOn(tools, "getWeeklySavingsTotal").mockRejectedValueOnce(new Error("Ledger summary unavailable."));
    const agent = createAgent([], tools);
    const suggestion = await agent.respond({
      userId: "user_123",
      conversationId: "progress_unavailable",
      message: "I almost bought a $12 pastry but decided to wait."
    });

    const response = await agent.respond({
      userId: "user_123",
      conversationId: "progress_unavailable",
      message: "Yes"
    });

    expect(response.decision.action).toBe("create_ledger_entry");
    expect(response.message).toContain("Done. I recorded $12.00");
    expect(response.message).toContain("couldn't load your weekly total");
    expect(response.message).toContain("No real money has moved yet");
    expect(await tools.listSavingsEntries("user_123")).toHaveLength(1);
    expect(suggestion.decision.proposal?.status).toBe("pending");
  });

  it("refuses an approval id that does not match the pending savings action", async () => {
    const agent = createAgent([
      {
        id: "habit_7th_street",
        merchantName: "7th Street",
        userId: "user_123",
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

  it("[APR-002] [APR-005] refuses another user attempting to approve a pending savings action", async () => {
    const agent = createAgent([
      {
        id: "habit_7th_street",
        merchantName: "7th Street",
        userId: "user_123",
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
        userId: "user_123",
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

  it("[IDM-002] [IDM-003] [AUD-004] [ERR-003] [ERR-004] retries an uncertain write with the same approval and audit links", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const proposal = await agent.respond({
      userId: "user_123",
      conversationId: "write_failure_retry",
      message: "I almost bought a $12 pastry but decided to wait."
    });
    const actionId = requireActionId(proposal.decision.toolCall?.actionId);
    const createEntry = tools.createSavingsEntry.bind(tools);
    const writeSpy = vi.spyOn(tools, "createSavingsEntry").mockImplementationOnce(async (input) => {
      await createEntry(input);
      throw new Error("Response lost after persistence.");
    });

    const uncertain = await agent.respond({
      userId: "user_123",
      conversationId: "write_failure_retry",
      message: "Yes"
    });
    expect(uncertain.decision.action).toBe("ask_follow_up");
    expect(uncertain.message).toContain("couldn't confirm");
    expect(uncertain.message).toContain("say yes to safely retry");
    expect(uncertain.message).not.toContain("Done. I recorded");
    expect(await tools.listSavingsEntries("user_123")).toHaveLength(1);

    const retried = await agent.respond({
      userId: "user_123",
      conversationId: "write_failure_retry",
      message: "Yes"
    });
    expect(retried.decision.action).toBe("create_ledger_entry");
    expect(retried.decision.proposal).toMatchObject({
      status: "recorded", ledgerEntryId: (await tools.listSavingsEntries("user_123"))[0]?.id
    });
    const entry = (await tools.listSavingsEntries("user_123"))[0];
    expect(entry).toMatchObject({
      userId: "user_123",
      proposalId: proposal.decision.proposal?.id,
      approvedActionId: actionId,
      approvalId: retried.decision.proposal?.status === "recorded"
        ? retried.decision.proposal.approval.id
        : undefined
    });
    expect(writeSpy.mock.calls).toHaveLength(2);
    expect(writeSpy.mock.calls[1]?.[0].approvalId).toBe(writeSpy.mock.calls[0]?.[0].approvalId);
    expect(retried.decision.proposalTransitions?.at(-1)).toMatchObject({
      proposalId: proposal.decision.proposal?.id,
      actionId,
      userId: "user_123",
      approvalId: entry?.approvalId,
      ledgerEntryId: entry?.id
    });
  });

  it("keeps a proposal retryable when the ledger write fails before saving", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    await agent.respond({
      userId: "user_123",
      conversationId: "write_failure_before_save",
      message: "I almost bought a $12 pastry but decided to wait."
    });
    vi.spyOn(tools, "createSavingsEntry").mockRejectedValueOnce(new Error("Ledger unavailable."));

    const failed = await agent.respond({
      userId: "user_123",
      conversationId: "write_failure_before_save",
      message: "Yes"
    });
    expect(failed.decision.action).toBe("ask_follow_up");
    expect(failed.message).toContain("haven't marked this action complete");
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const retried = await agent.respond({
      userId: "user_123",
      conversationId: "write_failure_before_save",
      message: "Yes"
    });
    expect(retried.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries("user_123")).toHaveLength(1);
  });

  it("asks about a vague savings moment and continues after the user gives context", async () => {
    const tools = new MockVictoriaTools([
      {
        id: "habit_7th_street",
        merchantName: "7th Street",
        userId: "user_123",
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
          userId: "user_123",
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

  it("uses specialist advice only when it agrees with the deterministic estimate", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const specialists: AgentTeamSpecialists = {
      ...base,
      savingsReasoning: {
        assess: async ({ finding }) => finding.classification.amountCents === undefined
          ? { outcome: "ask", confidence: 0.95, question: "Which amount should I use?" }
          : {
              outcome: "suggest",
              confidence: 0.95,
              amountCents: finding.classification.amountCents + 100,
              source: "user_provided",
              rationale: "Deliberately mismatched test advice."
            }
      }
    };
    const agent = createAgent([], tools, specialists);
    const response = await agent.respond({
      userId: "user_123",
      message: "I almost bought a $20 book but decided to wait."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("runs the specialist team for an avoided-spend turn, but approval still bypasses the team", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const specialists: AgentTeamSpecialists = {
      financialMoment: { analyze: vi.fn((input) => base.financialMoment.analyze(input)) },
      savingsReasoning: { assess: vi.fn((input) => base.savingsReasoning.assess(input)) },
      companionVoice: { respond: vi.fn((input) => base.companionVoice.respond(input)) }
    };
    const agent = createAgent([], tools, specialists);
    const context = { userId: "user_123", conversationId: "specialist_core_flow" };
    const proposed = await agent.respond({ ...context, message: "I almost bought a $20 book but waited." });

    expect(specialists.financialMoment.analyze).toHaveBeenCalledTimes(1);
    expect(specialists.savingsReasoning.assess).toHaveBeenCalledTimes(1);
    expect(specialists.companionVoice.respond).toHaveBeenCalledTimes(1);
    expect(proposed.decision.action).toBe("suggest_savings");
    expect(proposed.decision.suggestion?.amountCents).toBe(2000);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const recorded = await agent.respond({ ...context, message: "Yes" });
    expect(recorded.decision.action).toBe("create_ledger_entry");
    expect(specialists.financialMoment.analyze).toHaveBeenCalledTimes(1);
    expect(await tools.listSavingsEntries("user_123")).toHaveLength(1);
  });

  it("carries a vague avoided-spend moment through amount clarification, proposal, and approval", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    const specialists: AgentTeamSpecialists = {
      financialMoment: { analyze: vi.fn((input) => base.financialMoment.analyze(input)) },
      savingsReasoning: { assess: vi.fn((input) => base.savingsReasoning.assess(input)) },
      companionVoice: { respond: vi.fn((input) => base.companionVoice.respond(input)) }
    };
    const agent = createAgent([], tools, specialists);
    const context = { userId: "user_123", conversationId: "multi_turn_specialists" };

    const first = await agent.respond({ ...context, message: "I cooked instead of ordering takeout." });
    expect(first.decision.action).toBe("ask_follow_up");
    expect(first.decision.savingsEvent).toBeDefined();
    expect(first.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const amount = await agent.respond({ ...context, message: "About $18." });
    expect(amount.decision.action).toBe("suggest_savings");
    expect(amount.decision.savingsEvent?.id).toBe(first.decision.savingsEvent?.id);
    expect(amount.decision.suggestion?.amountCents).toBe(1800);
    expect(amount.decision.proposal?.status).toBe("pending");
    expect(amount.decision.toolCall?.requiresApproval).toBe(true);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const approval = await agent.respond({ ...context, message: "Yes" });
    expect(approval.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([{ amountCents: 1800 }]);
    expect(specialists.financialMoment.analyze).toHaveBeenCalledTimes(2);
    expect(specialists.savingsReasoning.assess).toHaveBeenCalledTimes(1);
    expect(specialists.companionVoice.respond).not.toHaveBeenCalled();
  });

  it("asks when specialist habit reasoning disagrees with the core estimator", async () => {
    const userHabit: UserHabit = {
      id: "habit_blue_bottle", userId: "user_123", merchantName: "Blue Bottle",
      typicalAmountCents: 675, currency: "USD", confidence: 0.9
    };
    const tools = new MockVictoriaTools([{
      ...userHabit,
      typicalAmountCents: 725
    }]);
    const specialists = createMockAgentTeamSpecialists();
    const agent = createAgent([userHabit], tools, specialists);
    const context = { userId: "user_123", conversationId: "estimate_disagreement" };
    const response = await agent.respond({
      ...context,
      message: "I made coffee at home instead of going to Blue Bottle."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const clarified = await agent.respond({ ...context, message: "About $7.25." });
    expect(clarified.decision.action).toBe("suggest_savings");
    expect(clarified.decision.suggestion?.amountCents).toBe(725);
    expect(clarified.decision.savingsEvent?.id).toBe(response.decision.savingsEvent?.id);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const recorded = await agent.respond({ ...context, message: "Yes" });
    expect(recorded.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([{ amountCents: 725 }]);
  });

  it("[ARC-005] turns low-confidence classification into a clarification and resumes after clearer context", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    let classificationCount = 0;
    const analyzedMessages: Array<{ message: string; context?: readonly string[] }> = [];
    const specialists: AgentTeamSpecialists = {
      ...base,
      savingsReasoning: { assess: vi.fn((input) => base.savingsReasoning.assess(input)) },
      companionVoice: { respond: vi.fn((input) => base.companionVoice.respond(input)) },
      financialMoment: {
        analyze: vi.fn(async (input) => {
          const { message } = input;
          classificationCount += 1;
          analyzedMessages.push({ message, context: input.conversationContext });
          return {
            classification: {
              type: "avoided_spend" as const,
              confidence: classificationCount === 1 ? 0.55 : 0.95,
              ...(classificationCount >= 3 ? { amountCents: 2000 } : {}),
              summary: message,
              needsClarification: false
            }
          };
        })
      }
    };
    const agent = createAgent([], tools, specialists);
    const context = { userId: "user_123", conversationId: "low_confidence_follow_up" };

    const uncertain = await agent.respond({ ...context, message: "I almost bought a $20 book, but I'm not sure." });
    expect(uncertain.decision.action).toBe("ask_follow_up");
    expect(uncertain.decision.classification.type).toBe("unclear");
    expect(uncertain.decision.proposal).toBeUndefined();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const clarified = await agent.respond({ ...context, message: "Yes, I did." });
    expect(analyzedMessages[1]?.message).toBe("Yes, I did.");
    expect(analyzedMessages[1]?.context).toContain("I almost bought a $20 book, but I'm not sure.");
    expect(clarified.decision.action).toBe("ask_follow_up");
    expect(clarified.decision.suggestion).toBeUndefined();

    const amount = await agent.respond({ ...context, message: "$20" });
    expect(amount.decision.action).toBe("suggest_savings");
    expect(amount.decision.suggestion?.amountCents).toBe(2000);
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);

    const recorded = await agent.respond({ ...context, message: "Yes" });
    expect(recorded.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries("user_123")).toMatchObject([{ amountCents: 2000 }]);
  });

  it("clears pending clarification context when the user switches to a clear question", async () => {
    const tools = new MockVictoriaTools();
    const base = createMockAgentTeamSpecialists();
    let firstCall = true;
    const specialists: AgentTeamSpecialists = {
      ...base,
      savingsReasoning: { assess: vi.fn((input) => base.savingsReasoning.assess(input)) },
      companionVoice: { respond: vi.fn((input) => base.companionVoice.respond(input)) },
      financialMoment: {
        analyze: vi.fn(async (input) => {
          if (firstCall) {
            firstCall = false;
            return { classification: {
              type: "avoided_spend" as const, confidence: 0.55, amountCents: 2000,
              summary: input.message, needsClarification: false
            } };
          }
          return base.financialMoment.analyze(input);
        })
      }
    };
    const agent = createAgent([], tools, specialists);
    const context = { userId: "user_123", conversationId: "switch_from_uncertain_intent" };

    const uncertain = await agent.respond({ ...context, message: "I might have skipped a purchase." });
    expect(uncertain.decision.action).toBe("ask_follow_up");
    const progress = await agent.respond({ ...context, message: "How much have I saved this week?" });

    expect(progress.decision.action).toBe("summarize_progress");
    expect(progress.message).toContain("No savings have been recorded");
    expect(specialists.savingsReasoning.assess).not.toHaveBeenCalled();
    expect(specialists.companionVoice.respond).not.toHaveBeenCalled();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("falls back to clarification when Financial Moment classification fails", async () => {
    const base = createMockAgentTeamSpecialists();
    const specialists: AgentTeamSpecialists = {
      ...base,
      financialMoment: { analyze: vi.fn(async () => { throw new Error("specialist unavailable"); }) },
      savingsReasoning: { assess: vi.fn((input) => base.savingsReasoning.assess(input)) },
      companionVoice: { respond: vi.fn((input) => base.companionVoice.respond(input)) }
    };
    const tools = new MockVictoriaTools();
    const response = await createAgent([], tools, specialists).respond({
      userId: "user_123", message: "I almost bought a $20 book but waited."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.classification.type).toBe("unclear");
    expect(response.decision.proposal).toBeUndefined();
    expect(specialists.savingsReasoning.assess).not.toHaveBeenCalled();
    expect(specialists.companionVoice.respond).not.toHaveBeenCalled();
    expect(await tools.listSavingsEntries("user_123")).toEqual([]);
  });

  it("asks after Savings Reasoning fails and restores safe wording when Companion Voice fails", async () => {
    const base = createMockAgentTeamSpecialists();
    const savingsFailure: AgentTeamSpecialists = {
      ...base,
      savingsReasoning: { assess: vi.fn(async () => { throw new Error("reasoning unavailable"); }) }
    };
    const askTools = new MockVictoriaTools();
    const asked = await createAgent([], askTools, savingsFailure).respond({
      userId: "user_123", message: "I almost bought a $20 book but waited."
    });
    expect(asked.decision.action).toBe("ask_follow_up");
    expect(asked.decision.proposal).toBeUndefined();
    expect(await askTools.listSavingsEntries("user_123")).toEqual([]);

    const voiceFailure: AgentTeamSpecialists = {
      ...base,
      companionVoice: { respond: vi.fn(async () => { throw new Error("voice unavailable"); }) }
    };
    const proposalTools = new MockVictoriaTools();
    const proposed = await createAgent([], proposalTools, voiceFailure).respond({
      userId: "user_123", message: "I almost bought a $20 book but waited."
    });
    expect(proposed.decision.action).toBe("suggest_savings");
    expect(proposed.message).toContain("Please confirm");
    expect(proposed.message).toContain("No real money has moved");
    expect(await proposalTools.listSavingsEntries("user_123")).toEqual([]);
  });

  it.each([
    { message: "How much have I saved this week?", action: "summarize_progress" },
    { message: "Put this toward my emergency fund.", action: "update_goal" },
    { message: "Correct the recorded amount to $24.", action: "ask_follow_up" }
  ] as const)("routes core behavior for '$message' without invoking unrelated specialists", async ({ message, action }) => {
    const base = createMockAgentTeamSpecialists();
    const specialists: AgentTeamSpecialists = {
      financialMoment: { analyze: vi.fn((input) => base.financialMoment.analyze(input)) },
      savingsReasoning: { assess: vi.fn((input) => base.savingsReasoning.assess(input)) },
      companionVoice: { respond: vi.fn((input) => base.companionVoice.respond(input)) }
    };
    const response = await createAgent([], new MockVictoriaTools(), specialists).respond({
      userId: "user_123", message
    });

    expect(response.decision.action).toBe(action);
    expect(specialists.financialMoment.analyze).toHaveBeenCalledTimes(1);
    expect(specialists.savingsReasoning.assess).not.toHaveBeenCalled();
    expect(specialists.companionVoice.respond).not.toHaveBeenCalled();
  });
});

function createAgent(
  habits: UserHabit[] = [],
  tools: MockVictoriaTools = new MockVictoriaTools(habits),
  specialists?: AgentTeamSpecialists
): VictoriaAgent {
  return new VictoriaAgent({
    llm: new MockLlmAdapter(),
    memory: new MockMemoryProvider(habits),
    tools,
    ...(specialists ? { specialists } : {})
  });
}

function requireActionId(actionId: string | undefined): string {
  if (!actionId) {
    throw new Error("Expected a pending action id.");
  }

  return actionId;
}

function savingsEntry(
  overrides: Partial<SavingsEntry> & Pick<SavingsEntry, "id" | "userId" | "amountCents" | "createdAt">
): SavingsEntry {
  return {
    eventId: "event_seed",
    proposalId: "proposal_seed",
    approvalId: "approval_seed",
    approvedActionId: "action_seed",
    currency: "USD",
    reason: "Seeded test entry",
    movementMode: "mock_ledger",
    status: "completed",
    ...overrides
  };
}
