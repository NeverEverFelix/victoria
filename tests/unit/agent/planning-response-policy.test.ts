import { describe, expect, it } from "vitest";
import {
  answerBufferQuestion,
  answerRecurringProjectionQuestion,
  describeAnnualProjection,
  describeCombinedProjectionAndClarifyRecordTarget,
  getPriorCoveredSpendProjection,
  isValidRestoredPlanningChoice
} from "../../../src/agent/planning-response-policy.js";
import type { AgentDecision } from "../../../src/agent/types.js";

describe("planning response policy", () => {
  it("answers a grounded yearly projection without presenting it as already saved", () => {
    expect(answerRecurringProjectionQuestion("How much is that over a year?", 3500, 3500))
      .toContain("$35.00 a month would be $420.00 over 12 months");
    expect(answerRecurringProjectionQuestion("How much is that over a year?", 3500, 2500)).toBeUndefined();
    expect(answerRecurringProjectionQuestion("How much is $50 over a year?", 3500, 3500)).toBeUndefined();
  });

  it("describes annual and combined projections with conditional language", () => {
    expect(describeAnnualProjection({ monthlyAmountCents: 3500, annualAmountCents: 42000, eventCount: 1 }))
      .toContain("planning projection, not an amount already saved");
    expect(describeCombinedProjectionAndClarifyRecordTarget(
      { monthlyAmountCents: 5000, annualAmountCents: 60000, eventCount: 2 },
      [{ monthlyAmountCents: 3500 }, { monthlyAmountCents: 1500 }], 3500
    )).toContain("$35.00 or $15.00");
  });

  it("answers a buffer question without implying a financial action", () => {
    expect(answerBufferQuestion("Would it make sense to keep this as an emergency fund buffer?", 3500))
      .toContain("nothing has been recorded");
    expect(answerBufferQuestion("I have an emergency fund", 3500)).toBeUndefined();
  });

  it("derives prior recurring projections only from explicit monthly covered-spend evidence", () => {
    expect(getPriorCoveredSpendProjection(["My employer now covers my $35 monthly gym membership."]))
      .toEqual({ validatedMonthlyAmountCents: 3500, validatedAnnualProjectionCents: 42000 });
    expect(getPriorCoveredSpendProjection(["I spent $35 once at the gym."])).toEqual({});
  });

  it("rejects restored planning state that disagrees with the pending proposal", () => {
    const valid = {
      planningChoice: { monthlyAmountCents: 3500, annualProjectionCents: 42000 },
      proposal: { suggestion: { amountCents: 3500 } }
    } as AgentDecision;
    const invalid = {
      ...valid,
      proposal: { suggestion: { amountCents: 2500 } }
    } as AgentDecision;
    expect(isValidRestoredPlanningChoice(valid)).toBe(true);
    expect(isValidRestoredPlanningChoice(invalid)).toBe(false);
  });
});
