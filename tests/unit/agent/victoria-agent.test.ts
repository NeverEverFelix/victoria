import { afterEach, describe, expect, it, vi } from "vitest";
import {
  MockLlmAdapter,
  MockMemoryProvider,
  MockVictoriaTools,
  VictoriaAgent
} from "../../../src/agent/index.js";
import type { UserHabit } from "../../../src/agent/types.js";
import type { SavingsEntry } from "../../../src/domain/savings/types.js";

describe("VictoriaAgent", () => {
  afterEach(() => vi.useRealTimers());

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

  it("[AUD-001] prefers a user-provided amount over merchant history when both are present", async () => {
    const tools = new MockVictoriaTools([
      {
        id: "habit_doordash",
        merchantName: "DoorDash",
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

  it("reports an uncertain ledger write honestly and retries the same action without duplicating", async () => {
    const tools = new MockVictoriaTools();
    const agent = createAgent([], tools);
    const proposal = await agent.respond({
      userId: "user_123",
      conversationId: "write_failure_retry",
      message: "I almost bought a $12 pastry but decided to wait."
    });
    const actionId = requireActionId(proposal.decision.toolCall?.actionId);
    const createEntry = tools.createSavingsEntry.bind(tools);
    vi.spyOn(tools, "createSavingsEntry").mockImplementationOnce(async (input) => {
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
    expect(retried.decision.proposal?.ledgerEntryId).toBe(
      (await tools.listSavingsEntries("user_123"))[0]?.id
    );
    expect((await tools.listSavingsEntries("user_123")).map((entry) => entry.approvedActionId)).toEqual([actionId]);
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
