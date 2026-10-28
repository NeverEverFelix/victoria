import { describe, expect, it } from "vitest";
import { employerCoveredRecurringSpend, isExplicitRealMoneyMovementRequest } from "../../../src/agent/money-movement-intent.js";

describe("covered recurring expense intent", () => {
  it.each(["$1,20", "$35.001", "-$35", "$-35", "$0"]) (
    "rejects an invalid covered-expense amount: %s", (amount) => {
      expect(employerCoveredRecurringSpend(`My employer now covers my gym membership, which costs ${amount} a month.`)).toBeUndefined();
    }
  );

  it("distinguishes a transfer command from a budgeting question about moving money", () => {
    expect(isExplicitRealMoneyMovementRequest("My company covers the $35 monthly gym bill. Please transfer $35 from checking to savings.")).toBe(true);
    expect(isExplicitRealMoneyMovementRequest("My company covers the $35 monthly gym bill. Is it a good idea to move this money elsewhere?")).toBe(false);
    expect(isExplicitRealMoneyMovementRequest("Please move the meeting to Tuesday.")).toBe(false);
  });
});
