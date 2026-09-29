import { describe, expect, it } from "vitest";
import { parseExplicitDollarAmountCents } from "../../../src/domain/financial-events/parse-explicit-amount.js";

describe("financial event domain", () => {
  it("parses an explicit dollar amount into cents", () => {
    expect(parseExplicitDollarAmountCents("I almost bought a $90 jacket.")).toBe(9000);
    expect(parseExplicitDollarAmountCents("I skipped a $6.75 coffee.")).toBe(675);
  });

  it("returns undefined when no explicit dollar amount exists", () => {
    expect(parseExplicitDollarAmountCents("I cooked instead of ordering takeout.")).toBeUndefined();
  });
});
