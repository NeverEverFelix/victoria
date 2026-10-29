import { describe, expect, it } from "vitest";
import { deterministicConversationFallback } from "../../../src/agent/conversation-fallback.js";
import type { ConversationResponderInput } from "../../../src/agent/conversation-responder.js";

function input(message: string, overrides: Partial<ConversationResponderInput> = {}): ConversationResponderInput {
  return {
    message,
    recentTurns: [],
    memories: [],
    baselineReply: "I can help think that through. What would be most useful to focus on first?",
    ...overrides
  };
}

describe("deterministicConversationFallback", () => {
  it("returns a topic-specific question for recognized ordinary conversation", () => {
    expect(deterministicConversationFallback(input("How should I think about changing jobs?")))
      .toContain("Which of those matters most");
  });

  it("addresses a stated social-time concern in a job-change question", () => {
    const reply = deterministicConversationFallback(input(
      "I'm considering changing jobs, but I'm worried I'll lose my social life."
    ));

    expect(reply).toContain("friends");
    expect(reply).toContain("hours");
    expect(reply).toContain("What social time would you most want to protect?");
    expect(reply).not.toMatch(/\$\d/);
  });

  it("responds to a pushback about an inflexible work boundary", () => {
    const reply = deterministicConversationFallback(input(
      "I'm not sure I can call it non-negotiable; my manager sometimes schedules Sunday requests. What's a realistic first boundary?"
    ));

    expect(reply).toContain("It doesn't have to be absolute");
    expect(reply).toContain("how much notice");
    expect(reply).toContain("what feels realistic to try once?");
    expect(reply).not.toMatch(/non-negotiable|must|always/i);
  });

  it("offers one flexible experiment when the user asks for a practical alternative to a generic prompt", () => {
    const reply = deterministicConversationFallback(input(
      "That generic question doesn't help. My manager sometimes schedules Sundays, and cooking with friends matters to me. Suggest one flexible thing I can try."
    ));

    expect(reply).toContain("choosing a Sunday cooking window");
    expect(reply).toContain("one backup time");
    expect(reply.length).toBeLessThan(450);
    expect(reply).not.toMatch(/\$\d|non-negotiable/i);
  });

  it("keeps a concise follow-up grounded in the earlier work-schedule discussion", () => {
    const reply = deterministicConversationFallback(input(
      "I asked for one flexible thing to try this week, please keep it to one sentence.",
      { recentTurns: [
        "User: My manager sometimes schedules Sundays, and cooking with friends matters to me.",
        "Victoria: What would you like to focus on?"
      ] }
    ));

    expect(reply).toBe("Try keeping Sunday cooking flexible: choose a window when you can, with another time in mind if work gets in the way.");
    expect(reply).not.toMatch(/\$\d|transfer|account|savings/i);
  });

  it("offers a small next step for a budget reflection without adding financial claims", () => {
    const reply = deterministicConversationFallback(input("My budget feels overwhelming today"));

    expect(reply).toContain("one piece at a time");
    expect(reply).toMatch(/what is due|what can wait|essentials/i);
    expect(reply).not.toMatch(/\$\d|you have|you owe/i);
  });

  it("preserves a low-cost dinner question when a budget reflection also needs fallback", () => {
    const reply = deterministicConversationFallback(input(
      "My budget feels overwhelming today. Could you suggest a low-cost dinner to make with friends?"
    ));

    expect(reply).toContain("what's most pressing");
    expect(reply).toContain("lentil and tomato soup");
    expect(reply).not.toMatch(/\$\d|ledger|record/i);
  });

  it("answers a low-cost meal question without inventing a dollar amount", () => {
    const reply = deterministicConversationFallback(input("Could you suggest a low-cost dinner to make with friends?"));

    expect(reply).toContain("lentil and tomato soup");
    expect(reply).toContain("inexpensive pantry staples");
    expect(reply).not.toMatch(/\$\d|ledger|record/i);
  });

  it("answers a recognized mixed-turn focus even while a separate savings action is pending", () => {
    const reply = deterministicConversationFallback(input(
      "I skipped a $20 book; what are good podcasts for walks?",
      { responseFocus: "What are good podcasts for walks?", pendingAction: "savings_entry" }
    ));

    expect(reply).toContain("conversational interview podcast");
    expect(reply).not.toMatch(/record|ledger|\$\d/i);
  });

  it("uses the supplied baseline when a financial workflow is active", () => {
    const baseline = "The $35 suggestion is still pending. What would you like to discuss?";
    expect(deterministicConversationFallback(input("I'm anxious about my promotion", {
      baselineReply: baseline,
      pendingAction: "savings_entry"
    }))).toBe(baseline);
  });

  it("uses the supplied baseline for a message outside its deterministic topics", () => {
    const baseline = "Tell me what has been on your mind.";
    expect(deterministicConversationFallback(input("I've been thinking about my garden", {
      baselineReply: baseline
    }))).toBe(baseline);
  });
});
