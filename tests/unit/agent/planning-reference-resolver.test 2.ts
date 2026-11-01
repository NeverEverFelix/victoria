import { describe, expect, it } from "vitest";
import { resolvePlanningReference } from "../../../src/agent/planning-reference-resolver.js";

const choice = { monthlyAmountCents: 3_500, annualProjectionCents: 42_000, selectedHorizon: "annual" as const };

describe("resolvePlanningReference", () => {
  it("binds a period-specific record request to the selected projected fact", () => {
    expect(resolvePlanningReference({ message: "bruh record the yearly amount", choice })).toEqual({
      kind: "resolved",
      period: "annual",
      amountCents: 42_000,
      amountMeaning: "conditional_projection",
      operation: "request_recording"
    });
  });

  it("treats a 12-month projection reference as annual instead of matching the word month", () => {
    expect(resolvePlanningReference({ message: "Please record the 12-month projection", choice })).toEqual({
      kind: "resolved",
      period: "annual",
      amountCents: 42_000,
      amountMeaning: "conditional_projection",
      operation: "request_recording"
    });
  });

  it("resolves a projection for the next twelve months as annual", () => {
    expect(resolvePlanningReference({ message: "Please record the projection for the next twelve months", choice })).toEqual({
      kind: "resolved",
      period: "annual",
      amountCents: 42_000,
      amountMeaning: "conditional_projection",
      operation: "request_recording"
    });
  });

  it("resolves a bare period answer to the matching current-period fact", () => {
    expect(resolvePlanningReference({ message: "monthly", choice })).toEqual({
      kind: "resolved",
      period: "monthly",
      amountCents: 3_500,
      amountMeaning: "current_period_amount",
      operation: "select_target"
    });
  });

  it("does not resolve questions or ambiguous competing periods as a choice", () => {
    expect(resolvePlanningReference({ message: "What about yearly?", choice })).toEqual({ kind: "not_a_reference" });
    expect(resolvePlanningReference({ message: "choose monthly or yearly", choice })).toEqual({
      kind: "unresolved",
      reason: "conflicting_periods"
    });
  });

  it("rejects an explicit amount that does not match the selected grounded fact", () => {
    expect(resolvePlanningReference({ message: "record $500 yearly", choice })).toEqual({
      kind: "unresolved",
      reason: "amount_mismatch"
    });
    expect(resolvePlanningReference({ message: "record $400 or $500 yearly", choice })).toEqual({
      kind: "unresolved",
      reason: "amount_mismatch"
    });
  });

  it("does not resolve a negated request into an affirmative period selection", () => {
    expect(resolvePlanningReference({ message: "don't record the yearly amount", choice })).toEqual({ kind: "not_a_reference" });
  });

  it("fails closed when the stored annual projection does not match the monthly fact", () => {
    expect(resolvePlanningReference({
      message: "record the yearly amount",
      choice: { monthlyAmountCents: 3_500, annualProjectionCents: 35_000 }
    })).toEqual({ kind: "unresolved", reason: "invalid_context" });
  });
});
