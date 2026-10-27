import { describe, expect, it } from "vitest";
import {
  isConversationTopicTurn,
  isExplicitFinancialActionQuestion,
  isOrdinaryQuestion,
  isReadOnlyEventHistoryQuestion
} from "../../../src/agent/conversation-routing.js";

describe("conversation routing helpers", () => {
  it("recognizes ordinary questions and statement topic switches", () => {
    expect(isOrdinaryQuestion("What would help me unwind?")).toBe(true);
    expect(isConversationTopicTurn("Let's talk about how my promotion feels.")).toBe(true);
  });

  it("keeps explicit action questions out of read-only history routing", () => {
    const mixedQuestion = "Should I record it, and which financial moment did I mention first?";
    expect(isExplicitFinancialActionQuestion(mixedQuestion)).toBe(true);
    expect(isReadOnlyEventHistoryQuestion(mixedQuestion)).toBe(false);
    expect(isReadOnlyEventHistoryQuestion("Which financial moment did I mention first?")).toBe(true);
  });
});
