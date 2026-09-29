import { describe, expect, it } from "vitest";
import {
  calculatePotentialMonthlySavings,
  sumCompletedSavings
} from "../../../src/domain/savings/totals.js";

describe("savings domain", () => {
  it("sums completed savings entries only", () => {
    expect(
      sumCompletedSavings([
        { amountCents: 2746, status: "completed" },
        { amountCents: 9000, status: "pending" },
        { amountCents: 675, status: "completed" },
        { amountCents: 1200, status: "cancelled" }
      ])
    ).toBe(3421);
  });

  it("calculates potential monthly savings from repeated decisions", () => {
    expect(calculatePotentialMonthlySavings(2746, 20)).toBe(54920);
  });

  it("rejects invalid monthly frequency", () => {
    expect(() => calculatePotentialMonthlySavings(2746, -1)).toThrow(
      "Times per month must be a non-negative integer."
    );
    expect(() => calculatePotentialMonthlySavings(2746, 2.5)).toThrow(
      "Times per month must be a non-negative integer."
    );
  });
});
