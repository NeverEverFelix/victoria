import { describe, expect, it } from "vitest";
import {
  parseExplicitDollarAmount,
  parseExplicitDollarAmountCents
} from "../../../src/domain/financial-events/parse-explicit-amount.js";

describe("financial event domain", () => {
  it("parses an explicit dollar amount into cents", () => {
    expect(parseExplicitDollarAmountCents("I almost bought a $90 jacket.")).toBe(9000);
    expect(parseExplicitDollarAmountCents("I skipped a $6.75 coffee.")).toBe(675);
  });

  it("returns undefined when no explicit dollar amount exists", () => {
    expect(parseExplicitDollarAmountCents("I cooked instead of ordering takeout.")).toBeUndefined();
  });

  it("distinguishes excess precision from a valid cent amount", () => {
    expect(parseExplicitDollarAmount("I almost bought it for $6.755.")).toEqual({
      status: "invalid_precision"
    });
    expect(parseExplicitDollarAmountCents("I almost bought it for $6.755.")).toBeUndefined();
  });

  it("rejects zero and negative explicit amounts", () => {
    for (const message of ["$0", "$0.00", "-$5", "$-5", "-$0.01"]) {
      expect(parseExplicitDollarAmount(`I avoided spending ${message}.`)).toEqual({
        status: "invalid_value"
      });
      expect(parseExplicitDollarAmountCents(`I avoided spending ${message}.`)).toBeUndefined();
    }
  });

  it("rejects amounts that cannot be represented safely in integer cents", () => {
    expect(parseExplicitDollarAmount("I avoided spending $999999999999999999999999."))
      .toEqual({ status: "invalid_value" });
  });

  it("asks for disambiguation when multiple dollar amounts are explicit", () => {
    expect(parseExplicitDollarAmount("I chose between a $20 and a $30 order.")).toEqual({
      status: "multiple_amounts"
    });
    expect(parseExplicitDollarAmountCents("I chose between a $20 and a $30 order.")).toBeUndefined();
  });

  it("recognizes an unsupported currency instead of treating it as no amount", () => {
    expect(parseExplicitDollarAmount("I almost bought it for €20.")).toEqual({
      status: "unsupported_currency"
    });
  });
});
