import { describe, expect, it } from "vitest";
import { medianTypicalSpendCents } from "../../../src/domain/financial-events/typical-spend.js";

describe("medianTypicalSpendCents", () => {
  it("returns the middle observed amount for an odd-sized sample without mutating it", () => {
    const amounts = [1200, 600, 7400, 800];

    expect(medianTypicalSpendCents(amounts)).toBe(1000);
    expect(amounts).toEqual([1200, 600, 7400, 800]);
  });

  it("averages the two middle amounts for an even-sized sample and rounds half up", () => {
    expect(medianTypicalSpendCents([1000, 2500, 10000, 20000])).toBe(6250);
    expect(medianTypicalSpendCents([1000, 2500, 10001, 20000])).toBe(6251);
  });

  it("requires at least three positive safe-integer amounts", () => {
    expect(medianTypicalSpendCents([])).toBeNull();
    expect(medianTypicalSpendCents([100, 200])).toBeNull();
    expect(medianTypicalSpendCents([100, 0, 300])).toBeNull();
    expect(medianTypicalSpendCents([100, -200, 300])).toBeNull();
    expect(medianTypicalSpendCents([100, Number.MAX_SAFE_INTEGER + 1, 300])).toBeNull();
  });
});
