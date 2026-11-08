import { describe, expect, it } from "vitest";
import {
  employerCoveredRecurringSpend,
  isExplicitRealMoneyMovementRequest,
  isRealMoneyMovementRequest
} from "../../../src/agent/money-movement-intent.js";

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

  it("does not classify a negated transfer as a real-money movement request", () => {
    expect(isRealMoneyMovementRequest("I don't want to transfer money. What's a good target?")).toBe(false);
    expect(isRealMoneyMovementRequest("Do not move the money; let's discuss a target instead.")).toBe(false);
    expect(isRealMoneyMovementRequest("Please transfer $20 from checking to savings.")).toBe(true);
  });

  it("does not classify a past-tense transfer mention and follow-up as a current request", () => {
    expect(isRealMoneyMovementRequest("I moved money last week. Do you think I moved enough?")).toBe(false);
  });
});
