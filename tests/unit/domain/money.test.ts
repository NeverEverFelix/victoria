import { describe, expect, it } from "vitest";
import {
  calculatePotentialMonthlySavings,
  dollarsToCents,
  formatUsd,
  sumCompletedSavings
} from "../../../src/domain/money.js";

describe("money domain", () => {
  it("formats cents as US dollars", () => {
    expect(formatUsd(2746)).toBe("$27.46");
    expect(formatUsd(0)).toBe("$0.00");
  });

  it("converts dollar amounts to cents safely", () => {
    expect(dollarsToCents(27.46)).toBe(2746);
    expect(dollarsToCents(6.755)).toBe(676);
  });

  it("rejects non-finite dollar amounts", () => {
    expect(() => dollarsToCents(Number.NaN)).toThrow("Dollar amount must be a finite number.");
    expect(() => dollarsToCents(Number.POSITIVE_INFINITY)).toThrow(
      "Dollar amount must be a finite number."
    );
  });

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

