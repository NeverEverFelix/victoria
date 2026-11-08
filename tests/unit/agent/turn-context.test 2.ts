import { describe, expect, it } from "vitest";
import { buildTurnContext, projectionFromResolvedReferences } from "../../../src/agent/turn-context.js";

describe("turn context", () => {
  it("grounds a combined projection in two distinct user-stated recurring costs", () => {
    const context = buildTurnContext({
      priorTurns: [
        "I canceled a $35/month yoga membership.",
        "Victoria: No problem. I won't record it."
      ],
      message: "I also canceled a $20-a-month streaming service. How much would both be over a year?"
    });
    expect(context.recurringCosts.map((cost) => cost.monthlyAmountCents)).toEqual([3500, 2000]);
    expect(context.annualProjection).toEqual({ monthlyAmountCents: 5500, annualAmountCents: 66000, eventCount: 2 });
  });

  it("does not guess which costs to combine when the reference has too many candidates", () => {
    const context = buildTurnContext({
      priorTurns: [
        "I canceled a $35/month yoga membership.",
        "I quit a $20-a-month streaming service.",
        "I ended a $12/month music subscription."
      ],
      message: "How much would both be over a year?"
    });
    expect(context.annualProjection).toBeUndefined();
    expect(context.unresolvedCombinedProjection).toBe(true);
  });

  it("[ARC-006] accepts only grounded model-selected event references for arithmetic", () => {
    const context = buildTurnContext({
      priorTurns: [
        "I canceled a $35/month yoga membership.",
        "I quit a $20-a-month streaming service.",
        "I ended a $12/month music subscription."
      ],
      message: "What is the yearly total for yoga and streaming?"
    });
    expect(projectionFromResolvedReferences(context, {
      kind: "annual_projection", sourceTurnIndexes: [0, 1], confidence: 0.92
    })).toEqual({ monthlyAmountCents: 5500, annualAmountCents: 66000, eventCount: 2 });
    expect(projectionFromResolvedReferences(context, {
      kind: "annual_projection", sourceTurnIndexes: [0, 99], confidence: 0.99
    })).toBeUndefined();
    expect(projectionFromResolvedReferences(context, {
      kind: "annual_projection", sourceTurnIndexes: [0, 1], confidence: 0.4
    })).toBeUndefined();
    const both = buildTurnContext({ priorTurns: context.recurringCosts.map((event) => event.sourceText),
      message: "What would both be over a year?" });
    expect(projectionFromResolvedReferences(both, {
      kind: "annual_projection", sourceTurnIndexes: [0], confidence: 0.99
    })).toBeUndefined();
  });

  it("separates a completed-entry repeat from an explicitly new occurrence", () => {
    const priorTurns = [
      "I made coffee at home instead of buying a $6 latte.",
      "Victoria: Would you like me to record $6.00?",
      "Yes, record the $6 latte I skipped.",
      "Victoria: Done. I recorded $6.00 in your Victoria savings ledger. No real money has moved yet."
    ];
    expect(buildTurnContext({ priorTurns, message: "Please log that coffee I skipped for $6." })
      .possibleRecordedRepeatAmountCents).toBe(600);
    expect(buildTurnContext({ priorTurns, message: "I skipped another $6 coffee today." })
      .possibleRecordedRepeatAmountCents).toBeUndefined();
  });

  it("retains a separate advice request after a clear refusal", () => {
    const context = buildTurnContext({
      priorTurns: [],
      message: "No, please do not record it. Just answer whether keeping that money as a buffer makes sense."
    });
    expect(context.followUpAfterDecline).toMatch(/answer whether keeping that money as a buffer makes sense/i);
  });
});
