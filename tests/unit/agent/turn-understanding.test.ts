import { describe, expect, it, vi } from "vitest";
import { buildConversationContextSnapshot } from "../../../src/agent/conversation-responder.js";
import { buildConversationIntentPlan } from "../../../src/agent/conversation-intent-plan.js";
import { interpretConversationTurn, validateAdvisoryTurnPlan, type AdvisoryTurnPlan } from "../../../src/agent/turn-understanding.js";

const modelPlan: AdvisoryTurnPlan = {
  schemaVersion: 1,
  primaryIntent: "financial_reflection",
  secondaryIntents: ["dialogue"],
  dialogueActs: ["personal_update", "question"],
  questionFocus: "How should I think about this change?",
  references: [{ phrase: "this change", kind: "prior_topic", confidence: "clear" }],
  requestedReadOnlyTools: [],
  actionMention: "none",
  requestedAction: "none",
  uncertainty: { needsClarification: false, reasons: [] }
};

function snapshot() {
  return buildConversationContextSnapshot({
    message: "Work gave me a raise, and I feel weird about saving more. How should I think about this change?",
    recentTurns: ["Victoria: What has been on your mind about work?"],
    memories: []
  });
}

describe("advisory turn understanding", () => {
  it("uses the model's contextual plan with the complete canonical snapshot", async () => {
    const contextSnapshot = snapshot();
    const understandTurn = vi.fn(async () => modelPlan);
    const fallback = buildConversationIntentPlan({ message: contextSnapshot.currentMessage,
      recentTurns: contextSnapshot.dialogueTurns.map((turn) => `${turn.role}: ${turn.content}`) });

    const result = await interpretConversationTurn({ contextSnapshot, fallback, provider: { understandTurn } });

    expect(understandTurn).toHaveBeenCalledExactlyOnceWith({ contextSnapshot });
    expect(result).toEqual({ plan: modelPlan, source: "model" });
  });

  it("rejects any provider attempt to add amounts, target IDs, permissions, or executable tool data", async () => {
    const contextSnapshot = snapshot();
    const fallback = buildConversationIntentPlan({ message: contextSnapshot.currentMessage });
    const result = await interpretConversationTurn({ contextSnapshot, fallback, provider: {
      understandTurn: async () => ({ ...modelPlan, amountCents: 3500, proposalId: "proposal-secret", approval: true })
    } });

    expect(result.source).toBe("fallback");
    expect(result.failure).toBe("invalid_output");
    expect(result.plan).not.toHaveProperty("amountCents");
    expect(result.plan).not.toHaveProperty("proposalId");
    expect(result.plan).not.toHaveProperty("approval");
  });

  it("falls back safely when the model is unavailable", async () => {
    const contextSnapshot = snapshot();
    const fallback = buildConversationIntentPlan({ message: contextSnapshot.currentMessage });
    const result = await interpretConversationTurn({ contextSnapshot, fallback, provider: {
      understandTurn: async () => { throw new Error("provider unavailable"); }
    } });

    expect(result.source).toBe("fallback");
    expect(result.failure).toBe("unavailable");
    expect(result.plan.uncertainty.needsClarification).toBe(false);
  });

  it("validates bounded, enumerated plan fields", () => {
    expect(validateAdvisoryTurnPlan(modelPlan)).toEqual(modelPlan);
    expect(validateAdvisoryTurnPlan({ ...modelPlan, requestedAction: "execute_transfer" })).toBeUndefined();
    expect(validateAdvisoryTurnPlan({ ...modelPlan, references: [{ phrase: "this", kind: "prior_topic", confidence: "clear", resolvedId: "proposal-1" }] }))
      .toBeUndefined();
  });
});
