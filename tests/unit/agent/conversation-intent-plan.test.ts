import { describe, expect, it } from "vitest";
import { buildConversationIntentPlan, mayDispatchConversationIntent } from "../../../src/agent/conversation-intent-plan.js";

describe("contextual multi-intent plan", () => {
  it.each([
    "I've been spending more lately. Can we talk about it?",
    "I saved $35 by switching gyms. Is that enough for vacation?"
  ])("routes a reflective financial question as read-only dialogue: %s", (message) => {
    const plan = buildConversationIntentPlan({ message });
    expect(plan.intents).toContain("dialogue");
    expect(plan.requestedActions).toEqual([]);
    expect(mayDispatchConversationIntent(plan)).toBe(true);
  });

  it("splits an independent question from an explicit savings proposal without authorizing it", () => {
    const plan = buildConversationIntentPlan({
      message: "Put the $35 toward vacation, and how long until summer?",
      recentTurns: ["My usual gym is $35 a month."]
    });
    expect(plan.intents).toContain("dialogue");
    expect(plan.intents).toContain("savings_proposal");
    expect(plan.readOnlyQuestions).toEqual(["How long until summer?"]);
    expect(plan.requestedActions).toHaveLength(1);
    expect(mayDispatchConversationIntent(plan)).toBe(false);
  });

  it("keeps ambiguous corrections unresolved, and treats memory control as its own intent", () => {
    const correction = buildConversationIntentPlan({
      message: "Actually I meant the other bill.",
      recentTurns: ["I have two recurring bills."]
    });
    expect(correction.intents).toContain("correction");
    expect(correction.unresolvedReferences).toEqual(["financial_reference"]);
    expect(correction.needsClarification).toBe(true);
    expect(buildConversationIntentPlan({ message: "Please forget that preference." }).intents)
      .toContain("memory_control");
  });

  it("does not call confirmation language an approved proposal in the plan", () => {
    const plan = buildConversationIntentPlan({ message: "Sure, that sounds nice." });
    expect(plan.requestedActions).toEqual([]);
    expect(plan.needsClarification).toBe(false);
    expect(mayDispatchConversationIntent(plan)).toBe(false);
  });

  it.each([
    { message: "I've been spending more lately. Can we talk about it?", recentTurns: [], intent: "dialogue", actions: 0, clarify: false },
    { message: "I saved $35 by switching gyms. Is that enough for vacation?", recentTurns: [], intent: "financial_analysis", actions: 0, clarify: false },
    { message: "My grocery bill has been stressing me out. What should I look at first?", recentTurns: [], intent: "dialogue", actions: 0, clarify: false },
    { message: "I spent $80 on meals this week and feel bad about it.", recentTurns: [], intent: "dialogue", actions: 0, clarify: false },
    { message: "Can we talk about my $120 phone bill?", recentTurns: [], intent: "dialogue", actions: 0, clarify: false },
    { message: "How much is $20 per week over a year?", recentTurns: [], intent: "financial_analysis", actions: 0, clarify: false },
    { message: "What did I say about the gym earlier?", recentTurns: ["I pay $35 monthly for the gym."], intent: "dialogue", actions: 0, clarify: false },
    { message: "I don't want to record anything; can you explain the $35 projection?", recentTurns: [], intent: "financial_analysis", actions: 0, clarify: false },
    { message: "Put $35 toward vacation.", recentTurns: ["My gym costs $35 a month."], intent: "savings_proposal", actions: 1, clarify: false },
    { message: "Allocate $12 toward my emergency fund.", recentTurns: [], intent: "savings_proposal", actions: 1, clarify: false },
    { message: "Link $15 to vacation.", recentTurns: [], intent: "savings_proposal", actions: 1, clarify: false },
    { message: "Assign $20 to travel.", recentTurns: [], intent: "savings_proposal", actions: 1, clarify: false },
    { message: "Apply $30 to my savings goal.", recentTurns: [], intent: "savings_proposal", actions: 1, clarify: false },
    { message: "Record this $18 savings entry.", recentTurns: [], intent: "savings_proposal", actions: 1, clarify: false },
    { message: "Log the $14 I saved.", recentTurns: [], intent: "savings_proposal", actions: 1, clarify: false },
    { message: "Add this to the ledger.", recentTurns: [], intent: "savings_proposal", actions: 1, clarify: false },
    { message: "Put the $35 toward vacation, and how long until summer?", recentTurns: ["My usual gym is $35 a month."], intent: "savings_proposal", actions: 1, clarify: false, question: "How long until summer?" },
    { message: "Actually, I meant the other bill.", recentTurns: ["I have two recurring bills."], intent: "correction", actions: 0, clarify: true },
    { message: "Change that to $15.", recentTurns: ["We discussed a $20 weekly amount."], intent: "correction", actions: 0, clarify: true },
    { message: "I meant the other amount, not the gym bill.", recentTurns: ["Gym is $35; phone is $60."], intent: "correction", actions: 0, clarify: true },
    { message: "Actually, I meant $25 per month.", recentTurns: ["We discussed $35 per month."], intent: "correction", actions: 0, clarify: false },
    { message: "Please forget my old vacation preference.", recentTurns: [], intent: "memory_control", actions: 0, clarify: false },
    { message: "Don't remember that I prefer dining out.", recentTurns: [], intent: "memory_control", actions: 0, clarify: false },
    { message: "Remember that I prefer a small buffer first.", recentTurns: [], intent: "memory_control", actions: 0, clarify: false },
    { message: "Sure, that sounds nice.", recentTurns: ["Would a small buffer help?"], intent: undefined, actions: 0, clarify: false },
    { message: "Yes, that's okay.", recentTurns: ["I could set aside $10 weekly."], intent: undefined, actions: 0, clarify: false },
    { message: "Maybe vacation later.", recentTurns: ["We discussed a vacation goal."], intent: undefined, actions: 0, clarify: false },
    { message: "What did we decide about the pending proposal?", recentTurns: ["A $10 weekly proposal is awaiting confirmation."], intent: "dialogue", actions: 0, clarify: false },
    { message: "Can you explain the difference between $35 monthly and $420 yearly?", recentTurns: [], intent: "financial_analysis", actions: 0, clarify: false },
    { message: "How much would $10 a week add up to in 12 months?", recentTurns: [], intent: "financial_analysis", actions: 0, clarify: false },
    { message: "I want to save for a car, but I can't do more than $25 monthly.", recentTurns: [], intent: "dialogue", actions: 0, clarify: false },
    { message: "I don't want to move money; I only want to discuss my budget.", recentTurns: [], intent: "dialogue", actions: 0, clarify: false }
  ])("keeps multi-turn fixture read-only or proposal-gated: $message", (fixture) => {
    const plan = buildConversationIntentPlan({ message: fixture.message, recentTurns: fixture.recentTurns });
    if (fixture.intent) expect(plan.intents).toContain(fixture.intent);
    expect(plan.requestedActions).toHaveLength(fixture.actions);
    expect(plan.needsClarification).toBe(fixture.clarify);
    if (fixture.question) expect(plan.readOnlyQuestions).toContain(fixture.question);
    if (fixture.actions > 0 || fixture.clarify || !fixture.intent) expect(mayDispatchConversationIntent(plan)).toBe(false);
  });
});
