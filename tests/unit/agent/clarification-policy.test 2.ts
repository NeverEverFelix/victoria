import { describe, expect, it } from "vitest";
import { clarificationMessage } from "../../../src/agent/clarification-policy.js";
import type { ClassifiedMessage } from "../../../src/agent/types.js";

function unclear(overrides: Partial<ClassifiedMessage> = {}): ClassifiedMessage {
  return { type: "unclear", confidence: 0.2, summary: "unclear request", needsClarification: true, ...overrides };
}

describe("clarificationMessage", () => {
  it("keeps intent-specific workflow questions ahead of amount-format questions", () => {
    expect(clarificationMessage(unclear({ uncertainIntent: "goal_allocation", amountIssue: "multiple_amounts" })))
      .toContain("Which saved amount and goal");
    expect(clarificationMessage(unclear({ uncertainIntent: "proposal_revision" })))
      .toContain("current proposal is unchanged");
    expect(clarificationMessage(unclear({ uncertainIntent: "entry_correction" })))
      .toContain("ledger entry is unchanged");
  });

  it("asks for one positive USD amount when amount parsing found a problem", () => {
    expect(clarificationMessage(unclear({ amountIssue: "invalid_value" }))).toContain("must be positive");
    expect(clarificationMessage(unclear({ amountIssue: "multiple_amounts" }))).toContain("Which single amount in USD");
    expect(clarificationMessage(unclear({ amountIssue: "invalid_precision" }))).toContain("two decimal places");
    expect(clarificationMessage(unclear({ amountIssue: "unsupported_currency" }))).toContain("only record USD");
  });

  it("uses the established avoided-spend clarification when no narrower issue is known", () => {
    expect(clarificationMessage(unclear())).toContain("What did you avoid spending on");
  });
});
