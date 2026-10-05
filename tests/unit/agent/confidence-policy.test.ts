import { describe, expect, it } from "vitest";
import { applyClassificationConfidencePolicy, MIN_ACTIONABLE_CONFIDENCE } from "../../../src/agent/confidence-policy.js";
import type { ClassifiedMessage } from "../../../src/agent/types.js";

describe("agent confidence policy", () => {
  const avoidedSpend: ClassifiedMessage = {
    type: "avoided_spend", confidence: 0.69, amountCents: 9000,
    summary: "Maybe skipped a jacket", needsClarification: false
  };

  it("turns action-oriented classification below the threshold into unclear", () => {
    expect(applyClassificationConfidencePolicy(avoidedSpend)).toEqual({
      type: "unclear", confidence: 0.69,
      summary: "Maybe skipped a jacket", needsClarification: true,
      uncertainIntent: "avoided_spend"
    });
  });

  it("keeps a classification at the documented threshold actionable", () => {
    expect(applyClassificationConfidencePolicy({
      ...avoidedSpend, confidence: MIN_ACTIONABLE_CONFIDENCE
    })).toMatchObject({ type: "avoided_spend", amountCents: 9000, needsClarification: false });
  });

  it("does not weaken an existing unclear classification", () => {
    const unclear = { ...avoidedSpend, type: "unclear" as const, confidence: 0.1, needsClarification: true };
    expect(applyClassificationConfidencePolicy(unclear)).toBe(unclear);
  });
});
