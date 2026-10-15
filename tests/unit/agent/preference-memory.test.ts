import { describe, expect, it } from "vitest";
import { MockLlmAdapter, MockMemoryProvider, MockVictoriaTools, VictoriaAgent } from "../../../src/agent/index.js";
import { buildTransactionFinancialProfile } from "../../../src/domain/financial-profile.js";
import { MockProfileTransactionHistoryProvider } from "../../../src/app/financial-profile/mock-profile-transaction-history-provider.js";
import { MockTransactionHistoryProvider } from "../../fixtures/mock-transaction-history-provider.js";

describe("explicit savings preference memory", () => {
  it("learns a stable contextual preference from ordinary conversation and retrieves it later", async () => {
    const memory = new MockMemoryProvider();
    const evidence = "I work late shifts, so afternoon reminders are easier for me.";
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools(),
      conversationalMemoryExtractor: {
        async extract() {
          return [{
            category: "preference", key: "reminder_time",
            value: "Prefers afternoon reminders because late shifts make mornings difficult.",
            evidence, confidence: 0.94, subject: "user", assertion: "affirmed", stability: "stable", sensitivity: "ordinary"
          }];
        }
      }
    });

    const learned = await agent.respond({ userId: "user_context_memory", message: evidence });
    expect(learned.message).toContain("keep that in mind for future conversations");
    expect(learned.decision.action).toBe("reflect");
    const laterContext = await memory.getMemoryForUser("user_context_memory", "reminders");
    expect(laterContext.conversationalMemories).toMatchObject([{
      category: "preference", key: "reminder_time", evidence, confidence: 0.94,
      sourceType: "user_statement"
    }]);
    const laterReply = await agent.respond({
      userId: "user_context_memory",
      conversationId: "a-new-conversation",
      message: "I'm trying to make reminders work better with my late shifts."
    });
    expect(laterReply.message).toContain("preference for afternoon reminders");
  });

  it("discards weak, temporary, sensitive, unsupported, third-party, negated, or hypothetical candidates", async () => {
    const memory = new MockMemoryProvider();
    const evidence = "I work late shifts, so afternoon reminders are easier for me.";
    const userMessage = `${evidence} My partner said, 'I hate mornings.' I do not prefer morning reminders. If I had more free time, I might start a budget journal. I am managing my diabetes.`;
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools(),
      conversationalMemoryExtractor: {
        async extract() {
          return [
            { category: "preference", key: "weak", value: "Weak", evidence, confidence: 0.7, subject: "user", assertion: "affirmed", stability: "stable", sensitivity: "ordinary" },
            { category: "other", key: "temporary", value: "Temporary", evidence, confidence: 0.95, subject: "user", assertion: "affirmed", stability: "temporary", sensitivity: "ordinary" },
            { category: "other", key: "sensitive", value: "Sensitive", evidence, confidence: 0.99, subject: "user", assertion: "affirmed", stability: "stable", sensitivity: "sensitive" },
            { category: "preference", key: "unsupported", value: "Unsupported", evidence: "I prefer mornings.", confidence: 0.99, subject: "user", assertion: "affirmed", stability: "stable", sensitivity: "ordinary" },
            { category: "habit", key: "other_person", value: "Third-party fact", evidence: "I hate mornings.", confidence: 0.99, subject: "user", assertion: "affirmed", stability: "stable", sensitivity: "ordinary" },
            { category: "preference", key: "negated", value: "Negated", evidence: "I do not prefer morning reminders.", confidence: 0.99, subject: "user", assertion: "affirmed", stability: "stable", sensitivity: "ordinary" },
            { category: "habit", key: "hypothetical", value: "Keeps a budget journal.", evidence: "I might start a budget journal.", confidence: 0.99, subject: "user", assertion: "affirmed", stability: "stable", sensitivity: "ordinary" },
            { category: "other", key: "health", value: "Has diabetes.", evidence: "I am managing my diabetes.", confidence: 0.99, subject: "user", assertion: "affirmed", stability: "stable", sensitivity: "ordinary" }
          ];
        }
      }
    });

    const response = await agent.respond({ userId: "user_rejected_memory", message: userMessage });

    expect(response.decision.action).toBe("reflect");
    expect(await memory.listConversationalMemories("user_rejected_memory")).toEqual([]);
  });

  it("keeps a pending savings approval visible when a separate preference is stated", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });

    const proposal = await agent.respond({
      userId: "user_pref_pending", conversationId: "chat_pref_pending",
      message: "I almost bought a $30 book but decided to wait."
    });
    expect(proposal.decision.action).toBe("suggest_savings");

    const preference = await agent.respond({
      userId: "user_pref_pending", conversationId: "chat_pref_pending",
      message: "I prefer saving $20 rather than $50 at a time."
    });
    expect(preference.decision.action).toBe("ask_follow_up");
    expect(preference.message).toContain("clear yes or no about the pending savings entry");
    expect(await memory.listConversationalMemories("user_pref_pending")).toHaveLength(1);

    const recorded = await agent.respond({
      userId: "user_pref_pending", conversationId: "chat_pref_pending", message: "Yes"
    });
    expect(recorded.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries("user_pref_pending")).toHaveLength(1);
  });

  it("[MEM-002] remembers an explicit preferred amount without suggesting or recording savings", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });

    const response = await agent.respond({
      userId: "user_pref", conversationId: "chat_pref",
      message: "I prefer saving $20 rather than $50 at a time."
    });

    expect(response.decision.action).toBe("reflect");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.decision.proposal).toBeUndefined();
    expect(response.decision.toolCall).toBeUndefined();
    expect(await tools.listSavingsEntries("user_pref")).toEqual([]);
    expect(await memory.listConversationalMemories("user_pref")).toMatchObject([{
      category: "preference",
      key: "savings_contribution_amount",
      value: "Prefers saving $20.00 rather than $50.00 at a time.",
      evidence: "I prefer saving $20 rather than $50 at a time.",
      confidence: 1
    }]);
  });

  it("[MEM-002] does not store tentative, equal, or malformed amount comparisons as preferences", async () => {
    const memory = new MockMemoryProvider();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools() });

    await agent.respond({ userId: "user_pref", message: "Maybe I should save $20 rather than $50?" });
    await agent.respond({ userId: "user_pref", message: "I prefer saving $20 rather than $20." });
    await agent.respond({ userId: "user_pref", message: "I prefer saving $20.999 rather than $50." });

    expect(await memory.listConversationalMemories("user_pref")).toEqual([]);
  });

  it("[MEM-003] appends a changed preference linked to the prior preference and keeps users separate", async () => {
    const memory = new MockMemoryProvider();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools() });
    const userId = "user_pref";
    await agent.respond({ userId, message: "I prefer saving $20 rather than $50 at a time." });
    await agent.respond({ userId, message: "Actually, I prefer saving $25 rather than $50 at a time." });

    const facts = await memory.listConversationalMemories(userId);
    expect(facts).toHaveLength(2);
    expect(facts[1]).toMatchObject({
      key: "savings_contribution_amount",
      value: "Prefers saving $25.00 rather than $50.00 at a time.",
      supersedesId: facts[0]?.id
    });
    expect(await memory.listConversationalMemories("another_user")).toEqual([]);
  });
});

describe("general conversational memory extraction", () => {
  it("retrieves relevant remembered financial profile facts for the current user turn", async () => {
    const memory = new MockMemoryProvider();
    await memory.rememberConversationalMemory("user_semantic", {
      category: "financial_pattern",
      key: "financial_profile:merchant:blue bottle",
      value: "Typical spend at Blue Bottle is $6.00 across 4 purchases.",
      evidence: "Derived from 4 posted USD purchases.", confidence: 0.8,
      sourceType: "plaid_transaction_profile", observedFrom: "2026-09-01",
      observedThrough: "2026-10-01", sourceRecordCount: 4
    });
    await memory.rememberConversationalMemory("other_user", {
      category: "financial_pattern", key: "financial_profile:merchant:blue bottle",
      value: "Typical spend at Blue Bottle is $12.00.", evidence: "Other user's profile.", confidence: 0.9
    });

    const recalled = await memory.searchConversationalMemories("user_semantic", "my Blue Bottle coffee spend");

    expect(recalled).toMatchObject([{ key: "financial_profile:merchant:blue bottle",
      sourceType: "plaid_transaction_profile", sourceRecordCount: 4 }]);
    expect(recalled.map((item) => item.value)).not.toContain("Typical spend at Blue Bottle is $12.00.");
  });

  it("[MEM-006] checks a speculative spend claim and appends a transaction-supported correction", async () => {
    const memory = new MockMemoryProvider();
    const earlier = await memory.rememberConversationalMemory("user_spend_fact_check", {
      category: "habit", key: "merchant_spend:blue_bottle",
      value: "Usually spends $5.00 at Blue Bottle.",
      evidence: "I usually spend $5 at Blue Bottle.", confidence: 0.95
    });
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools,
      transactionHistory: {
        async findTypicalMerchantSpend() {
          return { amountCents: 740, transactionCount: 4, observedThrough: "2026-10-12T00:00:00.000Z" };
        }
      }
    });
    const userId = "user_spend_fact_check";

    const response = await agent.respond({
      userId, message: "I theorize I spend around $6 at Blue Bottle."
    });

    expect(response.decision.action).toBe("reflect");
    expect(response.message).toContain("You estimated $6.00");
    expect(response.message).toContain("suggest about $7.40 across 4 purchases");
    const facts = await memory.listConversationalMemories(userId);
    expect(facts).toHaveLength(2);
    expect(facts[0]).toEqual(earlier);
    expect(facts[1]).toMatchObject({
      key: "merchant_spend:blue_bottle",
      value: "Usually spends $7.40 at Blue Bottle.",
      evidence: expect.stringContaining("User stated: I theorize I spend around $6 at Blue Bottle."),
      confidence: 0.9,
      supersedesId: earlier.id
    });

    const later = await agent.respond({
      userId, conversationId: "later", message: "I made coffee at home instead of going to Blue Bottle."
    });
    expect(later.decision.suggestion).toMatchObject({ amountCents: 740, source: "manual_estimate" });
    expect(await tools.listSavingsEntries(userId)).toEqual([]);
  });

  it("confirms a spend claim when recent transaction history agrees", async () => {
    const memory = new MockMemoryProvider();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools(),
      transactionHistory: {
        async findTypicalMerchantSpend() {
          return { amountCents: 600, transactionCount: 3, observedThrough: "2026-10-12T00:00:00.000Z" };
        }
      }
    });

    const response = await agent.respond({ userId: "user_spend_match", message: "I usually spend $6 at Blue Bottle." });

    expect(response.message).toContain("broadly consistent with recent linked transactions");
    expect(await memory.listConversationalMemories("user_spend_match")).toMatchObject([{
      value: "Usually spends $6.00 at Blue Bottle.", confidence: 0.9
    }]);
  });

  it("does not use stale transaction history to correct a claim or estimate avoided spend", async () => {
    const staleObservedThrough = new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString();
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools,
      transactionHistory: {
        async findTypicalMerchantSpend() {
          return { amountCents: 740, transactionCount: 4, observedThrough: staleObservedThrough };
        }
      }
    });
    const userId = "user_stale_transactions";

    const claim = await agent.respond({ userId, message: "I theorize I spend around $6 at Blue Bottle." });
    expect(claim.message).toContain("unverified estimate");
    expect(await memory.listConversationalMemories(userId)).toMatchObject([{
      value: "Usually spends $6.00 at Blue Bottle.", confidence: 0.55
    }]);

    const avoided = await agent.respond({
      userId, conversationId: "avoided", message: "I made coffee at home instead of going to Blue Bottle."
    });
    expect(avoided.decision.action).toBe("ask_follow_up");
    expect(avoided.decision.suggestion).toBeUndefined();
    expect(await tools.listSavingsEntries(userId)).toEqual([]);
  });

  it("does not use an unverified speculative spend claim as an estimate", async () => {
    const memory = new MockMemoryProvider();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools() });
    const userId = "user_unverified_spend_theory";

    const theory = await agent.respond({ userId, message: "I theorize I spend around $6 at Blue Bottle." });
    expect(theory.message).toContain("unverified estimate");
    expect(await memory.listConversationalMemories(userId)).toMatchObject([{ confidence: 0.55 }]);

    const avoided = await agent.respond({
      userId, conversationId: "later", message: "I made coffee at home instead of going to Blue Bottle."
    });
    expect(avoided.decision.action).toBe("ask_follow_up");
    expect(avoided.decision.suggestion).toBeUndefined();
  });

  it("[MEM-004] uses an explicit remembered merchant spend as a later avoided-spend estimate", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });
    const userId = "user_remembered_spend";

    const remembered = await agent.respond({
      userId,
      message: "I usually spend $6 at Blue Bottle for coffee."
    });
    expect(remembered.decision.action).toBe("reflect");
    expect(await tools.listSavingsEntries(userId)).toEqual([]);

    const avoided = await agent.respond({
      userId,
      conversationId: "later",
      message: "I made coffee at home instead of going to Blue Bottle."
    });

    expect(avoided.decision.action).toBe("suggest_savings");
    expect(avoided.decision.suggestion).toMatchObject({
      amountCents: 600,
      source: "manual_estimate",
      reason: "Estimated from your remembered typical spend at Blue Bottle."
    });
    expect(avoided.message).toContain("I estimate you avoided spending $6.00");
    expect(avoided.message).toContain("No real money has moved yet.");
    expect(await tools.listSavingsEntries(userId)).toEqual([]);
    expect(await memory.listConversationalMemories("another_user")).toEqual([]);

    const otherUser = await agent.respond({
      userId: "another_user",
      conversationId: "their_later",
      message: "I made coffee at home instead of going to Blue Bottle."
    });
    expect(otherUser.decision.action).toBe("ask_follow_up");
    expect(otherUser.decision.suggestion).toBeUndefined();
  });

  it("remembers a typical-spend statement with the amount after the merchant", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });
    const userId = "user_natural_spend_wording";

    const remembered = await agent.respond({
      userId, message: "My usual spend at Blue Bottle is around $6."
    });
    expect(remembered.decision.action).toBe("reflect");
    expect(await memory.listConversationalMemories(userId)).toMatchObject([{
      category: "habit",
      key: "merchant_spend:blue_bottle",
      value: "Usually spends $6.00 at Blue Bottle.",
      evidence: "My usual spend at Blue Bottle is around $6.",
      confidence: 0.95
    }]);

    const avoided = await agent.respond({
      userId, conversationId: "later", message: "I made coffee at home instead of going to Blue Bottle."
    });
    expect(avoided.decision.suggestion).toMatchObject({ amountCents: 600, source: "manual_estimate" });
    expect(await tools.listSavingsEntries(userId)).toEqual([]);
  });

  it("uses available transaction history when no relevant user memory is available", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const queriedMerchants: string[] = [];
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools,
      transactionHistory: {
        async findTypicalMerchantSpend({ userId, merchantName }) {
          expect(userId).toBe("user_transactions");
          queriedMerchants.push(merchantName);
          return { amountCents: 740, transactionCount: 4, observedThrough: "2026-10-12T00:00:00.000Z" };
        }
      }
    });

    const response = await agent.respond({
      userId: "user_transactions", conversationId: "history_estimate",
      message: "I made coffee at home instead of going to Blue Bottle."
    });

    expect(queriedMerchants).toEqual(["Blue Bottle"]);
    expect(response.decision.action).toBe("suggest_savings");
    expect(response.decision.suggestion).toMatchObject({
      amountCents: 740,
      source: "merchant_history",
      reason: expect.stringContaining("4 recent transactions")
    });
    expect(await tools.listSavingsEntries("user_transactions")).toEqual([]);
  });

  it("uses a built transaction profile for a proposal and still waits for explicit approval", async () => {
    const userId = "user_profile_estimate";
    const today = new Date();
    const todayText = today.toISOString().slice(0, 10);
    const priorDay = new Date(today.getTime() - 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const earlierDay = new Date(today.getTime() - 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const profile = buildTransactionFinancialProfile({
      userId,
      now: today,
      transactions: [600, 800, 1_000].map((amountCents, index) => ({
        transactionId: `mock-txn-${index}`,
        amountCents,
        isoCurrencyCode: "USD",
        date: [todayText, priorDay, earlierDay][index]!,
        merchantName: "Blue Bottle",
        category: "Coffee",
        pending: false
      }))
    });
    const profileProvider = new MockProfileTransactionHistoryProvider([profile]);
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools,
      transactionHistory: profileProvider
    });

    const proposal = await agent.respond({
      userId, conversationId: "profile_estimate",
      message: "I made coffee at home instead of going to Blue Bottle."
    });

    expect(profileProvider.lookupLog).toEqual([{ userId, merchantName: "Blue Bottle" }]);
    expect(proposal.decision.suggestion).toMatchObject({
      amountCents: 800,
      source: "merchant_history",
      reason: expect.stringContaining("3 recent transactions")
    });
    expect(proposal.message).toContain("Based on your usual spend at Blue Bottle");
    expect(proposal.message).toContain("Would you like me to record that");
    expect(await tools.listSavingsEntries(userId)).toEqual([]);

    const recorded = await agent.respond({
      userId, conversationId: "profile_estimate", message: "Yes"
    });
    expect(recorded.decision.action).toBe("create_ledger_entry");
    expect(await tools.listSavingsEntries(userId)).toMatchObject([{ amountCents: 800, movementMode: "mock_ledger" }]);
  });

  it("does not estimate from stale or undersampled profiles", async () => {
    const userId = "user_sparse_profile";
    const today = new Date();
    const date = today.toISOString().slice(0, 10);
    const profile = buildTransactionFinancialProfile({
      userId,
      now: today,
      transactions: [600, 800].map((amountCents, index) => ({
        transactionId: `sparse-txn-${index}`,
        amountCents,
        isoCurrencyCode: "USD",
        date,
        merchantName: "Blue Bottle",
        category: "Coffee",
        pending: false
      }))
    });
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools: new MockVictoriaTools(),
      transactionHistory: new MockProfileTransactionHistoryProvider([profile])
    });

    const response = await agent.respond({ userId, message: "I made coffee at home instead of going to Blue Bottle." });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.suggestion).toBeUndefined();

    const sufficientProfile = buildTransactionFinancialProfile({
      userId,
      now: today,
      transactions: [600, 800, 1_000].map((amountCents, index) => ({
        transactionId: `stale-txn-${index}`,
        amountCents,
        isoCurrencyCode: "USD",
        date,
        merchantName: "Blue Bottle",
        category: "Coffee",
        pending: false
      }))
    });
    const staleThrough = new Date(today.getTime() - 91 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const staleProfile = {
      ...sufficientProfile,
      facts: sufficientProfile.facts.map((fact) => ({ ...fact, observedThrough: staleThrough }))
    };
    const staleAgent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools: new MockVictoriaTools(),
      transactionHistory: new MockProfileTransactionHistoryProvider([staleProfile])
    });
    const staleResponse = await staleAgent.respond({
      userId, message: "I made coffee at home instead of going to Blue Bottle."
    });
    expect(staleResponse.decision.action).toBe("ask_follow_up");
    expect(staleResponse.decision.suggestion).toBeUndefined();
  });

  it("normalizes merchant variants while keeping transaction summaries scoped to each user", async () => {
    const history = new MockTransactionHistoryProvider([
      {
        userId: "user_history_a",
        merchantName: " BLUE-BOTTLE ",
        estimate: { amountCents: 740, transactionCount: 4, observedThrough: new Date().toISOString() }
      },
      {
        userId: "user_history_b",
        merchantName: "Blue Bottle",
        estimate: { amountCents: 990, transactionCount: 5, observedThrough: new Date().toISOString() }
      }
    ]);
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools: new MockVictoriaTools(),
      transactionHistory: history
    });

    const userA = await agent.respond({
      userId: "user_history_a", message: "I made coffee at home instead of going to Blue Bottle."
    });
    const userB = await agent.respond({
      userId: "user_history_b", message: "I made coffee at home instead of going to Blue Bottle."
    });
    const unrelatedUser = await agent.respond({
      userId: "user_history_c", message: "I made coffee at home instead of going to Blue Bottle."
    });

    expect(userA.decision.suggestion).toMatchObject({ amountCents: 740, source: "merchant_history" });
    expect(userB.decision.suggestion).toMatchObject({ amountCents: 990, source: "merchant_history" });
    expect(unrelatedUser.decision.action).toBe("ask_follow_up");
    expect(unrelatedUser.decision.suggestion).toBeUndefined();
    expect(history.lookupLog.map(({ userId, merchantName }) => ({ userId, merchantName }))).toEqual([
      { userId: "user_history_a", merchantName: "Blue Bottle" },
      { userId: "user_history_b", merchantName: "Blue Bottle" },
      { userId: "user_history_c", merchantName: "Blue Bottle" }
    ]);
  });

  it("does not consult transaction history when a remembered merchant amount matches", async () => {
    const memory = new MockMemoryProvider();
    await memory.rememberConversationalMemory("user_prefer_memory", {
      category: "habit", key: "merchant_spend:blue_bottle",
      value: "Usually spends $6.00 at Blue Bottle.",
      evidence: "I usually spend $6 at Blue Bottle.", confidence: 0.95
    });
    let transactionLookups = 0;
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools(),
      transactionHistory: {
        async findTypicalMerchantSpend() { transactionLookups += 1; throw new Error("History should not be queried when memory matches."); }
      }
    });

    const response = await agent.respond({
      userId: "user_prefer_memory", message: "I made coffee at home instead of going to Blue Bottle."
    });

    expect(response.decision.suggestion?.amountCents).toBe(600);
    expect(transactionLookups).toBe(0);
  });

  it("asks for the amount when the connected history source is unavailable or fails", async () => {
    const unavailable = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools: new MockVictoriaTools(),
      transactionHistory: {
        async findTypicalMerchantSpend() { return null; }
      }
    });
    const unavailableResponse = await unavailable.respond({
      userId: "user_unavailable", message: "I made coffee at home instead of going to Blue Bottle."
    });
    expect(unavailableResponse.decision.action).toBe("ask_follow_up");

    const failed = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory: new MockMemoryProvider(), tools: new MockVictoriaTools(),
      transactionHistory: {
        async findTypicalMerchantSpend() { throw new Error("Provider unavailable."); }
      }
    });
    const failedResponse = await failed.respond({
      userId: "user_failed", message: "I made coffee at home instead of going to Blue Bottle."
    });
    expect(failedResponse.decision.action).toBe("ask_follow_up");
    expect(failedResponse.decision.suggestion).toBeUndefined();
  });

  it("[MEM-005] remembers a user-provided amount after transaction history is unavailable", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools,
      transactionHistory: { async findTypicalMerchantSpend() { return null; } }
    });
    const userId = "user_answered_estimate";

    const clarification = await agent.respond({
      userId, conversationId: "first", message: "I made coffee at home instead of going to Blue Bottle."
    });
    expect(clarification.decision.action).toBe("ask_follow_up");
    expect(clarification.message).toContain("how much do you usually spend at Blue Bottle");
    expect(clarification.message).toContain("remember your estimate for future suggestions");

    const answer = await agent.respond({ userId, conversationId: "first", message: "About $7" });
    expect(answer.decision.action).toBe("suggest_savings");
    expect(answer.decision.suggestion).toMatchObject({ amountCents: 700, source: "user_provided" });
    expect(await tools.listSavingsEntries(userId)).toEqual([]);
    expect(await memory.listConversationalMemories(userId)).toMatchObject([{
      category: "habit",
      key: "merchant_spend:blue_bottle",
      value: "Usually spends $7.00 at Blue Bottle.",
      evidence: expect.stringContaining("user answered: About $7"),
      confidence: 0.9
    }]);

    const later = await agent.respond({
      userId, conversationId: "later", message: "I made coffee at home instead of going to Blue Bottle."
    });
    expect(later.decision.suggestion).toMatchObject({ amountCents: 700, source: "manual_estimate" });
  });

  it("[MEM-002] remembers explicit preferences, recurring habits, and stated goals without financial actions", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });
    const userId = "user_general_memory";

    await agent.respond({ userId, message: "I prefer a short weekly savings goal." });
    await agent.respond({ userId, message: "I usually make coffee at home on weekdays." });
    await agent.respond({ userId, message: "My goal is to save $1,000 for a trip to Japan." });

    const facts = await memory.listConversationalMemories(userId);
    expect(facts.map((fact) => fact.category)).toEqual(["preference", "habit", "goal"]);
    expect(facts.every((fact) => fact.evidence.length > 0 && fact.confidence > 0)).toBe(true);
    expect(facts[1]?.value.toLowerCase()).toContain("coffee at home");
    expect(facts[1]?.key).toBe("coffee_routine");
    expect(facts[2]?.value.toLowerCase()).toContain("trip to japan");
    expect(await tools.listSavingsEntries(userId)).toEqual([]);
    expect(await tools.listSavingsGoalAllocations(userId)).toEqual([]);
  });

  it("uses a relevant remembered goal to personalize an ordinary reply in a later conversation", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });
    const userId = "user_goal_personalization";

    await agent.respond({
      userId,
      conversationId: "goal-sharing-conversation",
      message: "My goal is to save $1,000 for a trip to Japan."
    });
    const reply = await agent.respond({
      userId,
      conversationId: "later-conversation",
      message: "I'm thinking about how to save money and feel stuck."
    });

    expect(reply.decision.action).toBe("reflect");
    expect(reply.message).toContain("saving for a trip to Japan");
    expect(reply.message).toContain("What feels most important right now?");
    const otherUserReply = await agent.respond({
      userId: "another_user",
      conversationId: "later-conversation",
      message: "I'm thinking about how to save money and feel stuck."
    });
    expect(otherUserReply.message).not.toContain("Japan");
    expect(await tools.listSavingsEntries(userId)).toEqual([]);
    expect(await tools.listSavingsGoalAllocations(userId)).toEqual([]);
  });

  it("uses a relevant remembered merchant routine without estimating or shaming", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });
    const userId = "user_routine_personalization";

    await agent.respond({
      userId,
      conversationId: "routine-sharing-conversation",
      message: "I usually order lunch from DoorDash on Fridays."
    });
    const reply = await agent.respond({
      userId,
      conversationId: "later-conversation",
      message: "I'm struggling with my Friday lunch routine and feel stuck."
    });

    expect(reply.decision.action).toBe("reflect");
    expect(reply.message).toContain("DoorDash routine");
    expect(reply.message).toContain("what would feel manageable this time");
    expect(reply.message).not.toMatch(/\$\s?\d/);
    expect(reply.decision.suggestion).toBeUndefined();
    expect(await tools.listSavingsEntries(userId)).toEqual([]);

    const otherUserReply = await agent.respond({
      userId: "another_user",
      conversationId: "later-conversation",
      message: "I'm struggling with my Friday lunch routine and feel stuck."
    });
    expect(otherUserReply.message).not.toContain("DoorDash");
  });

  it("remembers recurring habits separately for each named merchant", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });
    const userId = "user_merchant_habits";

    await agent.respond({ userId, message: "I usually order lunch from DoorDash on Fridays." });
    await agent.respond({ userId, message: "I usually get coffee at Blue Bottle in the mornings." });
    await agent.respond({ userId, message: "I usually order lunch from DoorDash on Thursdays." });

    const habits = await memory.listConversationalMemories(userId);
    expect(habits).toHaveLength(3);
    expect(habits[0]).toMatchObject({
      category: "habit", key: "merchant_habit:doordash",
      value: "Regularly order lunch from DoorDash on Fridays."
    });
    expect(habits[1]).toMatchObject({
      category: "habit", key: "merchant_habit:blue_bottle",
      value: "Regularly get coffee at Blue Bottle in the mornings."
    });
    expect(habits[2]).toMatchObject({
      category: "habit", key: "merchant_habit:doordash",
      value: "Regularly order lunch from DoorDash on Thursdays.",
      supersedesId: habits[0]?.id
    });
    expect(await memory.listConversationalMemories("another_user")).toEqual([]);
    expect(await tools.listSavingsEntries(userId)).toEqual([]);
  });

  it("uses a matching merchant habit to contextualize an amount clarification without estimating from it", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });
    const userId = "user_merchant_habit_clarification";

    await agent.respond({ userId, message: "I usually order lunch from DoorDash on Fridays." });
    await agent.respond({ userId, message: "I usually get coffee at Blue Bottle in the mornings." });
    await agent.respond({ userId, message: "I usually make coffee at home on weekdays." });
    const originalDoorDashHabit = (await memory.listConversationalMemories(userId))
      .find((item) => item.key === "merchant_habit:doordash");
    expect(originalDoorDashHabit).toBeDefined();

    const response = await agent.respond({
      userId, conversationId: "avoided", message: "I cooked instead of ordering DoorDash."
    });

    expect(response.decision.action).toBe("ask_follow_up");
    expect(response.decision.suggestion).toBeUndefined();
    expect(response.message).toContain("order lunch from DoorDash on Fridays");
    expect(response.message).toContain("don't have a typical cost yet");
    expect(response.message).toContain("how much do you usually spend at DoorDash");
    expect(response.message).not.toContain("Blue Bottle");
    expect(response.message).not.toContain("coffee at home");
    expect(await tools.listSavingsEntries(userId)).toEqual([]);

    const answer = await agent.respond({
      userId, conversationId: "avoided", message: "About $25"
    });
    expect(answer.decision.suggestion).toMatchObject({ amountCents: 2500, source: "user_provided" });
    const updatedMemories = await memory.listConversationalMemories(userId);
    expect(updatedMemories.find((item) => item.id === originalDoorDashHabit?.id)).toEqual(originalDoorDashHabit);
    expect(updatedMemories.find((item) => item.key === "merchant_spend:doordash")?.value)
      .toBe("Usually spends $25.00 at DoorDash.");

    const later = await agent.respond({
      userId, conversationId: "later", message: "I cooked instead of ordering DoorDash."
    });
    expect(later.decision.suggestion).toMatchObject({ amountCents: 2500, source: "manual_estimate" });
    expect(await tools.listSavingsEntries(userId)).toEqual([]);
  });

  it("uses verified transaction history before asking for the cost of a remembered merchant routine", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const userId = "user_verified_merchant_habit";
    await memory.rememberConversationalMemory(userId, {
      category: "habit",
      key: "merchant_habit:doordash",
      value: "Regularly order lunch from DoorDash on Fridays.",
      evidence: "I usually order lunch from DoorDash on Fridays.",
      confidence: 0.9
    });
    const lookups: Array<{ userId: string; merchantName: string }> = [];
    const agent = new VictoriaAgent({
      llm: new MockLlmAdapter(), memory, tools,
      transactionHistory: {
        async findTypicalMerchantSpend(input) {
          lookups.push(input);
          return {
            amountCents: 2435,
            transactionCount: 5,
            observedThrough: new Date().toISOString()
          };
        }
      }
    });

    const response = await agent.respond({
      userId, message: "I cooked instead of ordering DoorDash."
    });

    expect(lookups).toEqual([{ userId, merchantName: "DoorDash" }]);
    expect(response.decision.action).toBe("suggest_savings");
    expect(response.decision.suggestion).toMatchObject({ amountCents: 2435, source: "merchant_history" });
    expect(response.message).not.toContain("how much do you usually spend");
    expect(await tools.listSavingsEntries(userId)).toEqual([]);
  });

  it.each(["missing", "stale", "invalid", "failed"] as const)(
    "asks, remembers the user's amount, and reuses it when transaction history is %s",
    async (providerState) => {
      const memory = new MockMemoryProvider();
      const tools = new MockVictoriaTools();
      const userId = `user_merchant_fallback_${providerState}`;
      const rememberedRoutine = await memory.rememberConversationalMemory(userId, {
        category: "habit",
        key: "merchant_habit:doordash",
        value: "Regularly order lunch from DoorDash on Fridays.",
        evidence: "I usually order lunch from DoorDash on Fridays.",
        confidence: 0.9
      });
      const agent = new VictoriaAgent({
        llm: new MockLlmAdapter(), memory, tools,
        transactionHistory: {
          async findTypicalMerchantSpend() {
            if (providerState === "missing") return null;
            if (providerState === "failed") throw new Error("Transaction history unavailable.");
            return {
              amountCents: 3200,
              transactionCount: providerState === "invalid" ? 2 : 5,
              observedThrough: providerState === "stale"
                ? new Date(Date.now() - 91 * 24 * 60 * 60 * 1000).toISOString()
                : new Date().toISOString()
            };
          }
        }
      });

      const clarification = await agent.respond({
        userId, conversationId: "fallback", message: "I cooked instead of ordering DoorDash."
      });
      expect(clarification.decision.action).toBe("ask_follow_up");
      expect(clarification.decision.suggestion).toBeUndefined();
      expect(clarification.message).toContain("I usually order lunch from DoorDash on Fridays.");
      expect(clarification.message).toContain("don't have a typical cost yet");
      expect(await tools.listSavingsEntries(userId)).toEqual([]);

      const answer = await agent.respond({
        userId, conversationId: "fallback", message: "About $24"
      });
      expect(answer.decision.suggestion).toMatchObject({ amountCents: 2400, source: "user_provided" });
      const facts = await memory.listConversationalMemories(userId);
      expect(facts.find((fact) => fact.id === rememberedRoutine.id)).toEqual(rememberedRoutine);
      expect(facts.find((fact) => fact.key === "merchant_spend:doordash")).toMatchObject({
        value: "Usually spends $24.00 at DoorDash.",
        evidence: expect.stringContaining("user answered: About $24")
      });

      const later = await agent.respond({
        userId, conversationId: "later", message: "I cooked instead of ordering DoorDash."
      });
      expect(later.decision.suggestion).toMatchObject({ amountCents: 2400, source: "manual_estimate" });
      expect(await tools.listSavingsEntries(userId)).toEqual([]);
    }
  );

  it("[MEM-002] ignores tentative habits, preferences, and goals", async () => {
    const memory = new MockMemoryProvider();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools() });
    const userId = "user_uncertain_memory";

    await agent.respond({ userId, message: "Maybe I should make coffee at home more often." });
    await agent.respond({ userId, message: "Maybe I usually get coffee at Blue Bottle in the morning." });
    await agent.respond({ userId, message: "I might prefer smaller weekly goals." });
    await agent.respond({ userId, message: "I could save for a trip someday." });

    expect(await memory.listConversationalMemories(userId)).toEqual([]);
  });

  it("[MEM-003] avoids duplicate facts and links a changed fact on the same topic", async () => {
    const memory = new MockMemoryProvider();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools: new MockVictoriaTools() });
    const userId = "user_memory_update";

    await agent.respond({ userId, message: "I prefer a short weekly savings goal." });
    await agent.respond({ userId, message: "I prefer a short weekly savings goal." });
    await agent.respond({ userId, message: "I prefer a flexible weekly savings goal." });

    const facts = await memory.listConversationalMemories(userId);
    expect(facts).toHaveLength(2);
    expect(facts[1]?.supersedesId).toBe(facts[0]?.id);
  });

  it("[MEM-003] links a revised goal amount to the goal for the same destination", async () => {
    const memory = new MockMemoryProvider();
    const tools = new MockVictoriaTools();
    const agent = new VictoriaAgent({ llm: new MockLlmAdapter(), memory, tools });
    const userId = "user_goal_memory";

    await agent.respond({ userId, message: "My goal is to save $1,000 for a trip to Japan." });
    await agent.respond({ userId, message: "My goal is to save $1,500 for a trip to Japan." });

    const facts = await memory.listConversationalMemories(userId);
    expect(facts).toHaveLength(2);
    expect(facts[1]?.supersedesId).toBe(facts[0]?.id);
    expect(await tools.listSavingsGoalAllocations(userId)).toEqual([]);
  });
});
