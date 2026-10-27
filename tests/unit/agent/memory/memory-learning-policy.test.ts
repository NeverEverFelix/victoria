import { describe, expect, it } from "vitest";
import { isMemoryLearningEligibleTurn } from "../../../../src/agent/memory/memory-learning-policy.js";

describe("isMemoryLearningEligibleTurn", () => {
  it("permits read-only savings progress and conversational turns", () => {
    expect(isMemoryLearningEligibleTurn({ message: "I prefer a monthly view.", intent: "savings_progress" })).toBe(true);
    expect(isMemoryLearningEligibleTurn({ message: "I usually like short answers.", intent: "general_finance" })).toBe(true);
  });

  it.each([
    ["forget", "Forget that I like hiking."],
    ["memory correction", "Please update what you remember about my preferences."],
    ["ambiguous intent", "I might prefer monthly planning."],
    ["sensitive content", "I have diabetes and prefer short answers."]
  ])("blocks %s from optional extraction", (_name, message) => {
    expect(isMemoryLearningEligibleTurn({ message, intent: "general_finance" })).toBe(false);
  });

  it("blocks action-oriented and unsupported classifier intents", () => {
    expect(isMemoryLearningEligibleTurn({ message: "Record $10.", intent: "goal_allocation" })).toBe(false);
    expect(isMemoryLearningEligibleTurn({ message: "Move $10 to savings.", intent: "real_money_movement_request" })).toBe(false);
    expect(isMemoryLearningEligibleTurn({ message: "Yes", intent: "unclear", uncertainIntent: "goal_allocation" })).toBe(false);
  });
});
