import { describe, expect, it } from "vitest";
import {
  dollarsToCents,
  formatUsd
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

  it("rejects monetary values that cannot be represented as safe integer cents", () => {
    expect(() => dollarsToCents(Number.MAX_VALUE)).toThrow("safe integer number of cents");
    expect(() => formatUsd(Number.NaN)).toThrow("safe integer number of cents");
  });
});
