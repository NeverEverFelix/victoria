import { describe, expect, it } from "vitest";
import { calculateReadOnlySavingsQuestion } from "../../../src/agent/read-only-calculator.js";

describe("read-only recurring savings calculator", () => {
  it("calculates an explicit weekly amount over 52 weeks and states its assumption", () => {
    expect(calculateReadOnlySavingsQuestion("If I save $20 every week, how much is that in 12 months?")).toEqual({
      valueCents: 104_000,
      formula: "2000 cents × 52 weeks",
      inputs: [{ label: "weekly amount", value: "2000" }, { label: "weeks", value: "52" }],
      assumptions: ["A year is treated as 52 weekly contributions."]
    });
  });

  it("calculates explicit monthly contributions without claiming they were saved", () => {
    expect(calculateReadOnlySavingsQuestion("What is $35 per month over a year?")?.valueCents).toBe(42_000);
  });

  it.each([
    "If I save $20 a week, how much is that in 12 months? Please record it.",
    "How much would I have in my bank if I put in $20 every week for a year?",
    "What is $999999999999999999 per week over a year?"
  ])("declines unsupported or action-oriented arithmetic: %s", (message) => {
    expect(calculateReadOnlySavingsQuestion(message)).toBeUndefined();
  });
});
