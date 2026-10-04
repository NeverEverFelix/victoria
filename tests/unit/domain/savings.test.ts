import { describe, expect, it } from "vitest";
import {
  calculatePotentialMonthlySavings,
  sumCompletedSavings,
  sumCompletedSavingsForWeek
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

  it("sums completed entries from the current Monday-to-Monday UTC week", () => {
    expect(
      sumCompletedSavingsForWeek(
        [
          { amountCents: 2500, status: "completed", createdAt: "2026-10-05T00:00:00.000Z" },
          { amountCents: 1200, status: "completed", createdAt: "2026-10-07T12:00:00.000Z" },
          { amountCents: 9000, status: "completed", createdAt: "2026-10-04T23:59:59.999Z" },
          { amountCents: 5000, status: "pending", createdAt: "2026-10-06T12:00:00.000Z" },
          { amountCents: 3000, status: "cancelled", createdAt: "2026-10-06T12:00:00.000Z" }
        ],
        new Date("2026-10-07T15:00:00.000Z")
      )
    ).toBe(3700);
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
