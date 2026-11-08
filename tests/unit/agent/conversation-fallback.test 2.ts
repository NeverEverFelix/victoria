import { describe, expect, it } from "vitest";
import { deterministicConversationFallback } from "../../../src/agent/conversation-fallback.js";
import type { ConversationResponderInput } from "../../../src/agent/conversation-responder.js";
import type { AdvisoryTurnPlan } from "../../../src/agent/turn-understanding.js";

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
  it("uses a model-interpreted topic switch to keep a pending workflow unchanged without keyword matching", () => {
    const plan: AdvisoryTurnPlan = {
      schemaVersion: 1,
      primaryIntent: "dialogue",
      secondaryIntents: [],
      dialogueActs: ["topic_switch"],
      references: [],
      requestedReadOnlyTools: [],
      actionMention: "none",
      requestedAction: "none",
      uncertainty: { needsClarification: false, reasons: [] }
    };
    const reply = deterministicConversationFallback(input("Let's leave that for now; something else is on my mind.", {
      pendingAction: "savings_entry",
      contextSnapshot: {
        currentMessage: "Let's leave that for now; something else is on my mind.",
        turnUnderstanding: plan,
        turnUnderstandingSource: "model",
        dialogueTurns: [{ role: "user", content: "Let's leave that for now; something else is on my mind." }],
        selectedMemories: [], episodicSummaries: [], responseDepth: "normal"
      }
    }));

    expect(reply).toContain("topic you raised");
    expect(reply).toContain("remains pending and unchanged");
    expect(reply).not.toMatch(/approve|recorded|transfer|\$\d/i);
  });

  it("uses model-interpreted financial reflection for a paraphrase outside the deterministic phrases", () => {
    const reply = deterministicConversationFallback(input("I'm unsure how to feel about the choices I've been making lately.", {
      contextSnapshot: {
        currentMessage: "I'm unsure how to feel about the choices I've been making lately.",
        turnUnderstanding: {
          schemaVersion: 1,
          primaryIntent: "financial_reflection",
          secondaryIntents: ["dialogue"],
          dialogueActs: ["reflection"],
          references: [],
          requestedReadOnlyTools: [],
          actionMention: "none",
          requestedAction: "none",
          uncertainty: { needsClarification: false, reasons: [] }
        },
        turnUnderstandingSource: "model",
        dialogueTurns: [], selectedMemories: [], episodicSummaries: [], responseDepth: "normal"
      }
    }));

    expect(reply).toContain("Money decisions can feel complicated");
    expect(reply).toContain("what feels most important to sort through first");
    expect(reply).not.toMatch(/saved|record|\$\d/i);
  });

  it("does not mistake a deterministic plan for model interpretation in fallback selection", () => {
    const baseline = "Tell me what has been on your mind.";
    const reply = deterministicConversationFallback(input("I'm unsure how to feel about the choices I've been making lately.", {
      baselineReply: baseline,
      contextSnapshot: {
        currentMessage: "I'm unsure how to feel about the choices I've been making lately.",
        turnUnderstanding: {
          schemaVersion: 1,
          primaryIntent: "financial_reflection",
          secondaryIntents: [],
          dialogueActs: ["reflection"],
          references: [],
          requestedReadOnlyTools: [],
          actionMention: "none",
          requestedAction: "none",
          uncertainty: { needsClarification: false, reasons: [] }
        },
        turnUnderstandingSource: "fallback",
        dialogueTurns: [], selectedMemories: [], episodicSummaries: [], responseDepth: "normal"
      }
    }));

    expect(reply).toBe(baseline);
  });

  it("does not use an advisory approval attempt as authority for a fallback response", () => {
    const baseline = "I couldn't shape a useful answer just now.";
    const reply = deterministicConversationFallback(input("Yes", {
      baselineReply: baseline,
      contextSnapshot: {
        currentMessage: "Yes",
        turnUnderstanding: {
          schemaVersion: 1,
          primaryIntent: "workflow_action",
          secondaryIntents: [],
          dialogueActs: ["confirmation_attempt"],
          references: [],
          requestedReadOnlyTools: [],
          actionMention: "mock_ledger",
          requestedAction: "approval_attempt",
          uncertainty: { needsClarification: false, reasons: [] }
        },
        turnUnderstandingSource: "model",
        dialogueTurns: [], selectedMemories: [], episodicSummaries: [], responseDepth: "normal"
      }
    }));

    expect(reply).toBe(baseline);
    expect(reply).not.toMatch(/recorded|approved|transfer/i);
  });

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

  it("answers an unrelated weekend brainstorm without pulling the pending proposal into the fallback", () => {
    const reply = deterministicConversationFallback(input(
      "Can you brainstorm a few practical things to do on a rainy weekend?",
      { pendingAction: "savings_entry" }
    ));

    expect(reply).toMatch(/library|museum/);
    expect(reply).toMatch(/movie|recipe/);
    expect(reply).not.toMatch(/ledger|record|\$\d/i);
  });

  it("uses the supplied baseline when a financial workflow is active", () => {
    const baseline = "The $35 suggestion is still pending. What would you like to discuss?";
    expect(deterministicConversationFallback(input("I'm anxious about my promotion", {
      baselineReply: baseline,
      pendingAction: "savings_entry"
    }))).toBe(baseline);
  });

  it("answers a promotion topic switch during a pending proposal without repeating approval language", () => {
    const reply = deterministicConversationFallback(input(
      "I actually want to talk about what the promotion means for my budget.",
      { pendingAction: "savings_entry", baselineReply: "Do you approve recording $35.00?" }
    ));

    expect(reply).toContain("A promotion can bring a lot of change");
    expect(reply).toContain("remains pending and unchanged");
    expect(reply).not.toMatch(/approve|recording \$35/i);
  });

  it("keeps a debt topic switch read-only while a savings proposal is pending", () => {
    const reply = deterministicConversationFallback(input(
      "Can we talk about my credit card debt instead?",
      { pendingAction: "savings_entry", baselineReply: "Do you approve recording $35.00?" }
    ));

    expect(reply).toContain("focus on the debt first");
    expect(reply).toContain("remains pending and unchanged");
    expect(reply).not.toMatch(/approve|recording \$35|ledger entry/i);
  });

  it("answers a yes-prefixed debt topic switch during provider failure without approving", () => {
    const reply = deterministicConversationFallback(input(
      "Yes but before we do anything, can we talk about the debt?",
      { pendingAction: "savings_entry", baselineReply: "Do you approve recording $35.00?" }
    ));

    expect(reply).toContain("focus on the debt first");
    expect(reply).toContain("remains pending and unchanged");
    expect(reply).not.toMatch(/approve|recording \$35|ledger entry/i);
  });

  it("keeps a trip counterfactual read-only during provider failure with a proposal pending", () => {
    const reply = deterministicConversationFallback(input(
      "What if I used that money for a trip, actually?",
      { pendingAction: "savings_entry", baselineReply: "Do you approve recording $35.00?" }
    ));

    expect(reply).toContain("planning option");
    expect(reply).toContain("isn't money already saved");
    expect(reply).toContain("remains pending and unchanged");
    expect(reply).not.toMatch(/approve|recording \$35|transfer/i);
  });

  it("keeps an unrecognized but explicit topic switch separate from a pending approval", () => {
    const reply = deterministicConversationFallback(input(
      "Can we talk about my new team instead?",
      { pendingAction: "savings_entry", baselineReply: "Do you approve recording $35.00?" }
    ));

    expect(reply).toContain("focus on what you raised");
    expect(reply).toContain("remains pending and unchanged");
    expect(reply).not.toMatch(/approve|recording \$35/i);
  });

  it("describes a pending goal allocation accurately during an unrecognized topic switch", () => {
    const reply = deterministicConversationFallback(input(
      "Can we talk about my new team instead?",
      {
        pendingAction: "goal_allocation",
        pendingWorkflowReference: { kind: "goal_allocation", actionId: "goal-action-1" }
      }
    ));

    expect(reply).toContain("goal allocation remains pending and unrecorded");
    expect(reply).not.toContain("savings suggestion");
  });

  it("describes a pending correction accurately during an unrecognized topic switch", () => {
    const reply = deterministicConversationFallback(input(
      "Can we talk about my new team instead?",
      {
        pendingAction: "entry_correction",
        pendingWorkflowReference: { kind: "entry_correction", actionId: "correction-action-1" }
      }
    ));

    expect(reply).toContain("correction remains pending");
    expect(reply).toContain("recorded entry is unchanged");
    expect(reply).not.toContain("savings suggestion");
  });

  it("uses the supplied baseline for a message outside its deterministic topics", () => {
    const baseline = "Tell me what has been on your mind.";
    expect(deterministicConversationFallback(input("I've been thinking about my garden", {
      baselineReply: baseline
    }))).toBe(baseline);
  });
});
