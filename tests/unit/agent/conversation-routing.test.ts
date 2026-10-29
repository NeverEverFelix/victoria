import { describe, expect, it } from "vitest";
import {
  isConversationTopicTurn,
  isExplicitFinancialActionQuestion,
  isSafePendingWorkflowTopicSwitch,
  isOrdinaryQuestion,
  shouldRouteToConversationResponder,
  isReadOnlyEventHistoryQuestion,
  independentOrdinaryQuestion
} from "../../../src/agent/conversation-routing.js";

describe("conversation routing helpers", () => {
  it("recognizes ordinary questions and statement topic switches", () => {
    expect(isOrdinaryQuestion("What would help me unwind?")).toBe(true);
    expect(isConversationTopicTurn("Let's talk about how my promotion feels.")).toBe(true);
  });

  it("extracts only a clearly separate non-financial question from a mixed turn", () => {
    expect(independentOrdinaryQuestion("What could I cook for dinner? I avoided ordering takeout for $24."))
      .toBe("What could I cook for dinner?");
    expect(independentOrdinaryQuestion("Should I record it? I avoided ordering takeout for $24."))
      .toBeUndefined();
    expect(independentOrdinaryQuestion("I skipped a $20 book. What are good podcasts for walks?"))
      .toBe("What are good podcasts for walks?");
    expect(independentOrdinaryQuestion("I skipped a $20 book; what are good podcasts for walks?"))
      .toBe("What are good podcasts for walks?");
    expect(independentOrdinaryQuestion("I skipped a $20 book. Should I record it?"))
      .toBeUndefined();
    expect(independentOrdinaryQuestion("I skipped a $20 book, and what are good podcasts for walks?"))
      .toBe("What are good podcasts for walks?");
    expect(independentOrdinaryQuestion("I skipped a $20 book, and should I record it?"))
      .toBeUndefined();
    expect(independentOrdinaryQuestion(
      "I regret spending $42 on takeout. Could you suggest a low-cost dinner to make with friends? I'm unsure about the ledger."
    )).toBe("Could you suggest a low-cost dinner to make with friends?");
  });

  it("routes unpunctuated read-only topic statements without diverting action requests", () => {
    expect(shouldRouteToConversationResponder("I want to talk about changing jobs")).toBe(true);
    expect(shouldRouteToConversationResponder("I feel hopeful about starting my new job")).toBe(true);
    expect(shouldRouteToConversationResponder("Let's talk about my budget instead")).toBe(true);
    expect(shouldRouteToConversationResponder("I want to record $35 in savings")).toBe(false);
    expect(shouldRouteToConversationResponder("My budget feels overwhelming today")).toBe(true);
    expect(shouldRouteToConversationResponder("My budget feels overwhelming; can you save $20?")).toBe(false);
    expect(shouldRouteToConversationResponder("I'm stressed about saving money")).toBe(true);
    expect(shouldRouteToConversationResponder("I'm stressed about saving money; please save $20")).toBe(false);
    expect(shouldRouteToConversationResponder("I'm anxious about saving for retirement")).toBe(true);
    expect(shouldRouteToConversationResponder("I'm anxious about saving $200 for retirement")).toBe(false);
    expect(shouldRouteToConversationResponder("I'm worried I don't save enough for retirement")).toBe(true);
    expect(shouldRouteToConversationResponder("I'm worried I don't save the $200 for retirement")).toBe(false);
    expect(shouldRouteToConversationResponder("I feel guilty about my spending lately")).toBe(true);
    expect(shouldRouteToConversationResponder("I feel guilty about spending $50 on dinner")).toBe(false);
    expect(shouldRouteToConversationResponder("I cooked instead of ordering takeout")).toBe(false);
    expect(shouldRouteToConversationResponder("Put that toward my emergency fund.")).toBe(false);
  });

  it("keeps explicit action questions out of read-only history routing", () => {
    const mixedQuestion = "Should I record it, and which financial moment did I mention first?";
    expect(isExplicitFinancialActionQuestion(mixedQuestion)).toBe(true);
    expect(isReadOnlyEventHistoryQuestion(mixedQuestion)).toBe(false);
    expect(isReadOnlyEventHistoryQuestion("Which financial moment did I mention first?")).toBe(true);
  });

  it("routes explicit arithmetic questions to the read-only responder", () => {
    expect(shouldRouteToConversationResponder("If I save $20 every week, how much is that in 12 months?")).toBe(true);
    expect(shouldRouteToConversationResponder("If I save $20 a week, how much is that in 12 months? Please record it.")).toBe(false);
  });

  it("allows safe pending-workflow topic switches but blocks revisions and action requests", () => {
    expect(isSafePendingWorkflowTopicSwitch("Let's talk about my budget instead")).toBe(true);
    expect(isSafePendingWorkflowTopicSwitch("Can we talk about changing jobs instead?")).toBe(true);
    expect(isSafePendingWorkflowTopicSwitch("Can you change the savings amount instead?" )).toBe(false);
    expect(isSafePendingWorkflowTopicSwitch("Should I record the $35 now?")).toBe(false);
    expect(isSafePendingWorkflowTopicSwitch("Please correct the proposed amount")).toBe(false);
    expect(isSafePendingWorkflowTopicSwitch("Can you link this to my travel goal?")).toBe(false);
    expect(isSafePendingWorkflowTopicSwitch("Can you correct that entry to $25 instead?")).toBe(false);
  });
});
